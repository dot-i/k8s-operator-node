"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const FS = require("fs");
const YAML = require("js-yaml");
const k8s = require("@kubernetes/client-node");
const request = require("request-promise-native");
/**
 * Base class for an operator.
 */
class Operator {
    /**
     * Constructs an operator.
     */
    constructor(logger) {
        this._statusPathBuilders = {};
        this._watchRequests = {};
        this.kubeConfig = new k8s.KubeConfig();
        this.kubeConfig.loadFromDefault();
        this.k8sApi = this.kubeConfig.makeApiClient(k8s.CoreV1Api);
        this.k8sExtensionsApi = this.kubeConfig.makeApiClient(k8s.ApiextensionsV1beta1Api);
        this._logger = logger || new NullLogger();
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
     * Watch a custom resource.
     * @param group The group of the custom resource
     * @param version The version of the custom resource
     * @param plural The plural name of the custom resource
     * @param onEvent The async callback for added, modified or deleted events on the custom resource
     */
    async watchCustomResource(group, version, plural, onEvent) {
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
    async watchResource(group, version, plural, onEvent) {
        const apiVersion = group ? `${group}/${version}` : `${version}`;
        const id = `${plural}.${apiVersion}`;
        const serverUrl = this.kubeConfig.getCurrentCluster().server;
        this._statusPathBuilders[id] = (meta) => {
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
        const startWatch = () => this._watchRequests[id] = watch.watch(url, {}, async (type, obj) => onEvent({
            meta: new ResourceMeta(plural, obj),
            object: obj,
            type: type
        }), (err) => {
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
    async setResourceStatus(meta, status) {
        const requestOptions = {
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
exports.default = Operator;
/**
 * The resource event type.
 */
var ResourceEventType;
(function (ResourceEventType) {
    ResourceEventType["Added"] = "ADDED";
    ResourceEventType["Modified"] = "MODIFIED";
    ResourceEventType["Deleted"] = "DELETED";
})(ResourceEventType = exports.ResourceEventType || (exports.ResourceEventType = {}));
class ResourceMeta {
    constructor(plural, object) {
        this.id = `${plural}.${object.apiVersion}`;
        this.name = object.metadata.name;
        this.namespace = object.metadata.namespace;
        this.resourceVersion = object.metadata.resourceVersion;
        this.apiVersion = object.apiVersion;
        this.kind = object.kind;
    }
}
class NullLogger {
    // tslint:disable-next-line: no-empty
    info(message) { }
    // tslint:disable-next-line: no-empty
    warn(message) { }
    // tslint:disable-next-line: no-empty
    error(message) { }
}
//# sourceMappingURL=operator.js.map