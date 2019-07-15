import * as FS from 'fs';
import * as YAML from 'js-yaml';
import * as k8s from '@kubernetes/client-node';
import * as request from 'request-promise-native';

/**
 * Base class for an operator.
 */
export default abstract class Operator {
    protected kubeConfig: k8s.KubeConfig;
    protected k8sApi: k8s.CoreV1Api;
    protected k8sExtensionsApi: k8s.ApiextensionsV1beta1Api;

    private _logger: IOperatorLogger;
    private _statusPathBuilders: { [id: string]: (meta: IResourceMeta) => string; } = {};
    private _watchRequests: { [id: string]: any; } = {};

    /**
     * Constructs an operator.
     */
    constructor(logger?: IOperatorLogger) {
        this.kubeConfig = new k8s.KubeConfig();
        this.kubeConfig.loadFromDefault();
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
        this.k8sExtensionsApi = this.kubeConfig.makeApiClient(k8s.ApiextensionsV1beta1Api);
        this._logger = logger || new NullLogger();
    }

    /**
     * Run the operator, typically called from main().
     */
    public async start() {
        await this.init();
    }

    public stop() {
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
    protected async registerCustomResourceDefinition(crdFile: string): Promise<{ group: string, versions: any, plural: string }> {
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
     * Watch a custom resource.
     * @param group The group of the custom resource
     * @param version The version of the custom resource
     * @param plural The plural name of the custom resource
     * @param onEvent The async callback for added, modified or deleted events on the custom resource
     */
    protected async watchCustomResource(group: string, version: string, plural: string, onEvent: (event: IResourceEvent) => Promise<void>) {
        const result = await this.k8sExtensionsApi.readCustomResourceDefinition(`${plural}.${group}`);
        if (result.response.statusCode !== 200) {
            this._logger.error(`Failed to get custom resource ${plural}.${group}: ${result.response.statusCode}`);
        }
        await this.watchResource(group, version, plural, onEvent);
    }

    /**
     * Watch a Kubernetes resource.
     * @param group The group of the resource or an empty string for core resources
     * @param version The version of the resource
     * @param plural The plural name of the resource
     * @param onEvent The async callback for added, modified or deleted events on the resource
     */
    protected async watchResource(group: string, version: string, plural: string, onEvent: (event: IResourceEvent) => Promise<void>) {
        const apiVersion = group ? `${group}/${version}` : `${version}`;
        const id = `${plural}.${apiVersion}`;

        const serverUrl = this.kubeConfig.getCurrentCluster()!.server;
        this._statusPathBuilders[id] = (meta: IResourceMeta) => {
            let path = group ? `/apis/${group}/${version}/` : `/api/${version}/`;
            if (meta.namespace) {
                path += `namespaces/${meta.namespace}/`;
            }
            return serverUrl + path + `${plural}/${meta.name}/status`;
        };

        const watch = new k8s.Watch(this.kubeConfig);
        const url = group ? `/apis/${group}/${version}/${plural}` : `/api/${version}/${plural}`;

        //
        // Create "infinite" watch so we automatically recover in case the stream stops or gives an error.
        //
        const startWatch = () => this._watchRequests[id] = watch.watch(url, {},
            async (type, obj) => onEvent({
                meta: new ResourceMeta(plural, obj),
                object: obj,
                type: type as ResourceEventType
            }),
            (err: any) => {
                this._logger.warn(`restarting watch on resource ${id}`);
                setTimeout(startWatch, 100);
            });
        startWatch();

        this._logger.info(`watching resource ${id}`);
    }

    /**
     * Set the status subresource of a custom resource (if it has one defined).
     * @param meta The resource to update
     * @param status The status body to set
     */
    protected async setResourceStatus(meta: IResourceMeta, status: any) {
        const requestOptions: request.Options = {
            body: JSON.stringify({
                apiVersion: meta.apiVersion,
                kind: meta.kind,
                metadata: {
                    name: meta.name,
                    namespace: meta.namespace,
                    resourceVersion: meta.resourceVersion
                },
                status
            }),
            uri: this._statusPathBuilders[meta.id](meta)
        };
        this.kubeConfig.applyToRequest(requestOptions);
        await request.put(requestOptions, (error, response, body) => {
            if (error) {
                this._logger.error(error.message || error);
            }
        });
    }
}

/**
 * An event on a Kubernetes resource.
 */
export interface IResourceEvent {
    meta: IResourceMeta;
    type: ResourceEventType;
    object: any;
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
 * Some meta information on the resource.
 */
export interface IResourceMeta {
    name: string;
    namespace: string;
    id: string;
    resourceVersion: string;
    apiVersion: string;
    kind: string;
}

class ResourceMeta implements IResourceMeta {
    public id: string;
    public name: string;
    public namespace: string;
    public resourceVersion: string;
    public apiVersion: string;
    public kind: string;

    constructor(plural: string, object: any) {
        this.id = `${plural}.${object.apiVersion}`;
        this.name = object.metadata.name;
        this.namespace = object.metadata.namespace;
        this.resourceVersion = object.metadata.resourceVersion;
        this.apiVersion = object.apiVersion;
        this.kind = object.kind;
    }
}

/**
 * Logger interface.
 */
export interface IOperatorLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}

class NullLogger implements IOperatorLogger {
    // tslint:disable-next-line: no-empty
    public info(message: string): void { }
    // tslint:disable-next-line: no-empty
    public warn(message: string): void { }
    // tslint:disable-next-line: no-empty
    public error(message: string): void { }
}
