import * as k8s from '@kubernetes/client-node';
/**
 * Base class for an operator.
 */
export default abstract class Operator {
    protected kubeConfig: k8s.KubeConfig;
    protected k8sApi: k8s.CoreV1Api;
    protected k8sExtensionsApi: k8s.ApiextensionsV1beta1Api;
    private _logger;
    private _statusPathBuilders;
    private _watchRequests;
    /**
     * Constructs an operator.
     */
    constructor(logger?: IOperatorLogger);
    /**
     * Run the operator, typically called from main().
     */
    start(): Promise<void>;
    stop(): void;
    /**
     * Initialize the operator, add your resource watchers here.
     */
    protected abstract init(): Promise<void>;
    /**
     * Register a custom resource defintion.
     * @param crdFile The path to the custom resource definition's YAML file
     */
    protected registerCustomResourceDefinition(crdFile: string): Promise<{
        group: string;
        versions: any;
        plural: string;
    }>;
    /**
     * Watch a custom resource.
     * @param group The group of the custom resource
     * @param version The version of the custom resource
     * @param plural The plural name of the custom resource
     * @param onEvent The async callback for added, modified or deleted events on the custom resource
     */
    protected watchCustomResource(group: string, version: string, plural: string, onEvent: (event: IResourceEvent) => Promise<void>): Promise<void>;
    /**
     * Watch a Kubernetes resource.
     * @param group The group of the resource or an empty string for core resources
     * @param version The version of the resource
     * @param plural The plural name of the resource
     * @param onEvent The async callback for added, modified or deleted events on the resource
     */
    protected watchResource(group: string, version: string, plural: string, onEvent: (event: IResourceEvent) => Promise<void>): Promise<void>;
    /**
     * Set the status subresource of a custom resource (if it has one defined).
     * @param meta The resource to update
     * @param status The status body to set
     */
    protected setResourceStatus(meta: IResourceMeta, status: any): Promise<void>;
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
export declare enum ResourceEventType {
    Added = "ADDED",
    Modified = "MODIFIED",
    Deleted = "DELETED"
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
/**
 * Logger interface.
 */
export interface IOperatorLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
