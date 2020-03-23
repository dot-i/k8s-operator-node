"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Async = require("async");
const FS = require("fs");
const YAML = require("js-yaml");
const k8s = require("@kubernetes/client-node");
const request = require("request-promise-native");
class NullLogger {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    info(message) {
        // no-op
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    warn(message) {
        // no-op
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    error(message) {
        // no-op
    }
}
/**
 * The resource event type.
 */
var ResourceEventType;
(function (ResourceEventType) {
    ResourceEventType["Added"] = "ADDED";
    ResourceEventType["Modified"] = "MODIFIED";
    ResourceEventType["Deleted"] = "DELETED";
})(ResourceEventType = exports.ResourceEventType || (exports.ResourceEventType = {}));
class ResourceMetaImpl {
    constructor(id, object) {
        var _a, _b;
        if (!((_a = object.metadata) === null || _a === void 0 ? void 0 : _a.name)
            || !((_b = object.metadata) === null || _b === void 0 ? void 0 : _b.resourceVersion)
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
    static createWithId(id, object) {
        return new ResourceMetaImpl(id, object);
    }
    static createWithPlural(plural, object) {
        return new ResourceMetaImpl(`${plural}.${object.apiVersion}`, object);
    }
}
/**
 * Base class for an operator.
 */
class Operator {
    /**
     * Constructs an operator.
     */
    constructor(logger) {
        this._resourcePathBuilders = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this._watchRequests = {};
        this.kubeConfig = new k8s.KubeConfig();
        this.kubeConfig.loadFromDefault();
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
        this.k8sExtensionsApi = this.kubeConfig.makeApiClient(k8s.ApiextensionsV1beta1Api);
        this._logger = logger || new NullLogger();
        // Use an async queue to make sure we treat each incoming event sequentially using async/await
        this._eventQueue = Async.queue(async (args) => await args.onEvent(args.event));
    }
    /**
     * Run the operator, typically called from main().
     */
    async start() {
        await this.init();
    }
    stop() {
        for (const req of Object.values(this._watchRequests)) {
            req.abort();
        }
    }
    /**
     * Register a custom resource defintion.
     * @param crdFile The path to the custom resource definition's YAML file
     */
    async registerCustomResourceDefinition(crdFile) {
        const crd = YAML.load(FS.readFileSync(crdFile, 'utf8'));
        try {
            await this.k8sExtensionsApi.createCustomResourceDefinition(crd);
            this._logger.info(`registered custom resource definition '${crd.metadata.name}'`);
        }
        catch (err) {
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
    getCustomResourceApiUri(group, version, plural, namespace) {
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
     */
    async watchResource(group, version, plural, onEvent) {
        const apiVersion = group ? `${group}/${version}` : `${version}`;
        const id = `${plural}.${apiVersion}`;
        this._resourcePathBuilders[id] = (meta) => this.getCustomResourceApiUri(group, version, plural, meta.namespace);
        //
        // Create "infinite" watch so we automatically recover in case the stream stops or gives an error.
        //
        const uri = group ? `/apis/${group}/${version}/${plural}` : `/api/${version}/${plural}`;
        const watch = new k8s.Watch(this.kubeConfig);
        const startWatch = async () => this._watchRequests[id] = await watch.watch(uri, {}, (type, obj) => this._eventQueue.push({
            event: {
                meta: ResourceMetaImpl.createWithPlural(plural, obj),
                object: obj,
                type: type
            },
            onEvent
        }), err => {
            if (err) {
                this._logger.warn(`restarting watch on resource ${id} (reason: ${JSON.stringify(err)})`);
            }
            setTimeout(startWatch, 100);
        });
        await startWatch();
        this._logger.info(`watching resource ${id}`);
    }
    /**
     * Watch a namespaced Kubernetes resource.
     * @param group The group of the resource or an empty string for core resources
     * @param version The version of the resource
     * @param plural The plural name of the resource
     * @param namespace The namespace which the resource is in
     * @param onEvent The async callback for added, modified or deleted events on the resource
     */
    async watchNamespacedResource(group, version, plural, onEvent, namespace) {
        const apiVersion = group ? `${group}/${version}` : `${version}`;
        const id = `${plural}.${apiVersion}`;
        this._resourcePathBuilders[id] = (meta) => this.getCustomResourceApiUri(group, version, plural, meta.namespace);
        //
        // Create "infinite" watch so we automatically recover in case the stream stops or gives an error.
        //
        let uri = group ? `/apis/${group}/${version}/` : `/api/${version}/`;
        if (namespace) {
            uri += `namespaces/${namespace}/`;
        }
        uri += plural;
        const watch = new k8s.Watch(this.kubeConfig);
        const startWatch = async () => this._watchRequests[id] = await watch.watch(uri, {}, (type, obj) => this._eventQueue.push({
            event: {
                meta: ResourceMetaImpl.createWithPlural(plural, obj),
                object: obj,
                type: type
            },
            onEvent
        }), err => {
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
    async setResourceStatus(meta, status) {
        const requestOptions = this.buildResourceStatusRequest(meta, status, false);
        try {
            const responseBody = await request.put(requestOptions, err => {
                if (err) {
                    this._logger.error(err.message || JSON.stringify(err));
                }
            });
            return ResourceMetaImpl.createWithId(meta.id, JSON.parse(responseBody));
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
    async patchResourceStatus(meta, status) {
        const requestOptions = this.buildResourceStatusRequest(meta, status, true);
        try {
            const responseBody = await request.patch(requestOptions, err => {
                if (err) {
                    this._logger.error(err.message || JSON.stringify(err));
                }
            });
            return ResourceMetaImpl.createWithId(meta.id, JSON.parse(responseBody));
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
    async handleResourceFinalizer(event, finalizer, deleteAction) {
        var _a;
        const metadata = event.object.metadata;
        if (!metadata || (event.type !== ResourceEventType.Added && event.type !== ResourceEventType.Modified)) {
            return false;
        }
        if (!metadata.deletionTimestamp && (!metadata.finalizers || !metadata.finalizers.includes(finalizer))) {
            // Make sure our finalizer is added when the resource is first created.
            const finalizers = (_a = metadata.finalizers) !== null && _a !== void 0 ? _a : [];
            finalizers.push(finalizer);
            await this.setResourceFinalizers(event.meta, finalizers);
            return true;
        }
        else if (metadata.deletionTimestamp) {
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
    async setResourceFinalizers(meta, finalizers) {
        const requestOptions = {
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
        await request.patch(requestOptions, async (error) => {
            if (error) {
                this._logger.error(error.message || JSON.stringify(error));
                return;
            }
        });
    }
    buildResourceStatusRequest(meta, status, isPatch) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = {
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
        const requestOptions = {
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
exports.default = Operator;
//# sourceMappingURL=operator.js.map