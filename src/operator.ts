import * as Async from 'async';
import * as FS from 'fs';
import * as YAML from 'js-yaml';
import * as k8s from '@kubernetes/client-node';
import * as request from 'request-promise-native';
import { KubernetesObject, V1beta1CustomResourceDefinitionVersion } from '@kubernetes/client-node';

/**
 * Logger interface.
 */
export interface OperatorLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

class NullLogger implements OperatorLogger {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public info(message: string): void {
        // no-op
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public warn(message: string): void {
        // no-op
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    public error(message: string): void {
        // no-op
    }
}

/**
 * The resource event type.
 */
export enum ResourceEventType {
    Added = 'ADDED',
    Modified = 'MODIFIED',
    Deleted = 'DELETED'
}

/**
 * An event on a Kubernetes resource.
 */
export interface ResourceEvent {
    meta: ResourceMeta;
    type: ResourceEventType;
    object: KubernetesObject;
}

/**
 * Some meta information on the resource.
 */
export interface ResourceMeta {
    name: string;
    namespace?: string;
    id: string;
    resourceVersion: string;
    apiVersion: string;
    kind: string;
}

class ResourceMetaImpl implements ResourceMeta {
    public static createWithId(id: string, object: KubernetesObject): ResourceMeta {
        return new ResourceMetaImpl(id, object);
    }

    public static createWithPlural(plural: string, object: KubernetesObject): ResourceMeta {
        return new ResourceMetaImpl(`${plural}.${object.apiVersion}`, object);
    }

    public id: string;
    public name: string;
    public namespace?: string;
    public resourceVersion: string;
    public apiVersion: string;
    public kind: string;

    private constructor(id: string, object: KubernetesObject) {
        if (!object.metadata?.name
            || !object.metadata?.resourceVersion
            || !object.apiVersion
            || !object.kind) {
            throw Error(`Malformed event object for '${id}'`);
        }
        this.id = id;
        this.name = object.metadata.name;
        this.namespace = object.metadata.namespace;
        this.resourceVersion = object.metadata.resourceVersion;
        this.apiVersion = object.apiVersion;
        this.kind = object.kind;
    }
}

/**
 * Base class for an operator.
 */
export default abstract class Operator {
    protected kubeConfig: k8s.KubeConfig;
    protected k8sApi: k8s.CoreV1Api;
    protected k8sExtensionsApi: k8s.ApiextensionsV1beta1Api;

    private _logger: OperatorLogger;
    private _resourcePathBuilders: { [id: string]: (meta: ResourceMeta) => string } = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private _watchRequests: { [id: string]: any } = {};
    private _eventQueue: Async.AsyncQueue<{ event: ResourceEvent; onEvent: (event: ResourceEvent) => Promise<void> }>;

    /**
     * Constructs an operator.
     */
    constructor(logger?: OperatorLogger) {
        this.kubeConfig = new k8s.KubeConfig();
        this.kubeConfig.loadFromDefault();
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
        this.k8sExtensionsApi = this.kubeConfig.makeApiClient(k8s.ApiextensionsV1beta1Api);
        this._logger = logger || new NullLogger();

        // Use an async queue to make sure we treat each incoming event sequentially using async/await
        this._eventQueue = Async.queue<{ onEvent: (event: ResourceEvent) => Promise<void>; event: ResourceEvent }>(
            async (args) => await args.onEvent(args.event));
    }

    /**
     * Run the operator, typically called from main().
     */
    public async start(): Promise<void> {
        await this.init();
    }

    public stop(): void {
        for (const req of Object.values(this._watchRequests)) {
            req.abort();
        }
    }

    /**
     * Initialize the operator, add your resource watchers here.
     */
    protected abstract async init(): Promise<void>;

    /**
     * Register a custom resource defintion.
     * @param crdFile The path to the custom resource definition's YAML file
     */
    protected async registerCustomResourceDefinition(crdFile: string): Promise<{ group: string; versions: V1beta1CustomResourceDefinitionVersion[]; plural: string }> {
        const crd = YAML.load(FS.readFileSync(crdFile, 'utf8'));
        try {
            await this.k8sExtensionsApi.createCustomResourceDefinition(crd as k8s.V1beta1CustomResourceDefinition);
            this._logger.info(`registered custom resource definition '${crd.metadata.name}'`);
        } catch (err) {
            // API returns a 409 Conflict if CRD already exists.
            if (err.response.statusCode !== 409) {
                throw err;
            }
        }
        return { group: crd.spec.group, versions: crd.spec.versions, plural: crd.spec.names.plural };
    }

    /**
     * Get uri to the API for your custom resource.
     * @param group The group of the custom resource
     * @param version The version of the custom resource
     * @param plural The plural name of the custom resource
     * @param namespace Optional namespace to include in the uri
     */
    protected getCustomResourceApiUri(group: string, version: string, plural: string, namespace?: string): string {
        let path = group ? `/apis/${group}/${version}/` : `/api/${version}/`;
        if (namespace) {
            path += `namespaces/${namespace}/`;
        }
        path += plural;
        return this.k8sApi.basePath + path;
    }

    /**
     * Watch a Kubernetes resource.
     * @param group The group of the resource or an empty string for core resources
     * @param version The version of the resource
     * @param plural The plural name of the resource
     * @param onEvent The async callback for added, modified or deleted events on the resource
     * @param namespace The namespace of the resource (optional)
     */
    protected async watchResource(group: string, version: string, plural: string, onEvent: (event: ResourceEvent) => Promise<void>, namespace?: string): Promise<void> {
        const apiVersion = group ? `${group}/${version}` : `${version}`;
        const id = `${plural}.${apiVersion}`;

        this._resourcePathBuilders[id] = (meta: ResourceMeta): string => this.getCustomResourceApiUri(group, version, plural, meta.namespace);

        //
        // Create "infinite" watch so we automatically recover in case the stream stops or gives an error.
        //
        let uri = group ? `/apis/${group}/${version}/` : `/api/${version}/`;
        if (namespace) {
            uri += `namespaces/${namespace}/`;
        }
        uri += plural;

        const watch = new k8s.Watch(this.kubeConfig);

        const startWatch = async (): Promise<void> => this._watchRequests[id] = await watch.watch(uri, {},
            (type, obj) => this._eventQueue.push({
                event: {
                    meta: ResourceMetaImpl.createWithPlural(plural, obj),
                    object: obj,
                    type: type as ResourceEventType
                },
                onEvent
            }),
            err => {
                if (err) {
                    this._logger.warn(`restarting watch on resource ${id} (reason: ${JSON.stringify(err)})`);
                }
                setTimeout(startWatch, 100);
            });
        await startWatch();

        this._logger.info(`watching resource ${id}`);
    }

    /**
     * Set the status subresource of a custom resource (if it has one defined).
     * @param meta The resource to update
     * @param status The status body to set
     */
    protected async setResourceStatus(meta: ResourceMeta, status: unknown): Promise<ResourceMeta | null> {
        const requestOptions: request.Options = this.buildResourceStatusRequest(meta, status, false);
        try {
            const responseBody = await request.put(requestOptions, err => {
                if (err) {
                    this._logger.error(err.message || JSON.stringify(err));
                }
            });
            return ResourceMetaImpl.createWithId(meta.id, JSON.parse(responseBody as string));
        }
        catch (err) {
            this._logger.error(err.message || JSON.stringify(err));
            return null;
        }
    }

    /**
     * Patch the status subresource of a custom resource (if it has one defined).
     * @param meta The resource to update
     * @param status The status body to set in JSON Merge Patch format (https://tools.ietf.org/html/rfc7386)
     */
    protected async patchResourceStatus(meta: ResourceMeta, status: unknown): Promise<ResourceMeta | null> {
        const requestOptions = this.buildResourceStatusRequest(meta, status, true);
        try {
            const responseBody = await request.patch(requestOptions, err => {
                if (err) {
                    this._logger.error(err.message || JSON.stringify(err));
                }
            });
            return ResourceMetaImpl.createWithId(meta.id, JSON.parse(responseBody as string));
        }
        catch (err) {
            this._logger.error(err.message || JSON.stringify(err));
            return null;
        }
    }

    /**
     * Handle deletion of resource using a unique finalizer. Call this when you receive an added or modified event.
     *
     * If the resource doesn't have the finalizer set yet, it will be added. If the finalizer is set and the resource
     * is marked for deletion by Kubernetes your 'deleteAction' action will be called and the finalizer will be removed.
     * @param event The added or modified event.
     * @param finalizer Your unique finalizer string
     * @param deleteAction An async action that will be called before your resource is deleted.
     * @returns True if no further action is needed, false if you still need to process the added or modified event yourself.
     */
    protected async handleResourceFinalizer(event: ResourceEvent, finalizer: string,
        deleteAction: (event: ResourceEvent) => Promise<void>): Promise<boolean> {
        const metadata = event.object.metadata;
        if (!metadata || (event.type !== ResourceEventType.Added && event.type !== ResourceEventType.Modified)) {
            return false;
        }
        if (!metadata.deletionTimestamp && (!metadata.finalizers || !metadata.finalizers.includes(finalizer))) {
            // Make sure our finalizer is added when the resource is first created.
            const finalizers = metadata.finalizers ?? [];
            finalizers.push(finalizer);
            await this.setResourceFinalizers(event.meta, finalizers);
            return true;
        } else if (metadata.deletionTimestamp) {
            if (metadata.finalizers && metadata.finalizers.includes(finalizer)) {
                // Resource is marked for deletion with our finalizer still set. So run the delete action
                // and clear the finalizer, so the resource will actually be deleted by Kubernetes.
                await deleteAction(event);
                const finalizers = metadata.finalizers.filter((f) => f !== finalizer);
                await this.setResourceFinalizers(event.meta, finalizers);
            }
            // Resource is marked for deletion, so don't process it further.
            return true;
        }
        return false;
    }

    /**
     * Set (or clear) the finalizers of a resource.
     * @param meta The resource to update
     * @param finalizers The array of finalizers for this resource
     */
    protected async setResourceFinalizers(meta: ResourceMeta, finalizers: string[]): Promise<void> {
        const requestOptions: request.Options = {
            body: JSON.stringify({
                metadata: {
                    finalizers
                }
            }),
            uri: `${this._resourcePathBuilders[meta.id](meta)}/${meta.name}`
        };
        requestOptions.headers = {
            'Content-Type': 'application/merge-patch+json'
        };
        this.kubeConfig.applyToRequest(requestOptions);

        await request.patch(requestOptions, async error => {
            if (error) {
                this._logger.error(error.message || JSON.stringify(error));
                return;
            }
        });
    }

    private buildResourceStatusRequest(meta: ResourceMeta, status: unknown, isPatch: boolean): request.Options {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body: any = {
            apiVersion: meta.apiVersion,
            kind: meta.kind,
            metadata: {
                name: meta.name,
                resourceVersion: meta.resourceVersion
            },
            status
        };
        if (meta.namespace) {
            body.metadata.namespace = meta.namespace;
        }
        const requestOptions: request.Options = {
            body: JSON.stringify(body),
            uri: this._resourcePathBuilders[meta.id](meta) + `/${meta.name}/status`
        };
        if (isPatch) {
            requestOptions.headers = {
                'Content-Type': 'application/merge-patch+json'
            };
        }
        this.kubeConfig.applyToRequest(requestOptions);
        return requestOptions;
    }
}
