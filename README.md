# NodeJS Kubernetes operator framework

[![Build Status](https://travis-ci.com/dot-i/k8s-operator-node.svg?branch=master)](https://travis-ci.com/dot-i/k8s-operator-node)
[![Version](https://img.shields.io/github/package-json/v/dot-i/k8s-operator-node.svg)](https://www.npmjs.com/package/@dot-i/k8s-operator)
![node](https://img.shields.io/badge/node-%3E=10-blue.svg)

The **NodeJS** operator framework for **Kubernetes** is implemented in
[TypeScript](https://www.typescriptlang.org), but can be called from either
Javascript or TypeScript.

The operator framework is implemented for server-side use with node
using the `@kubernetes/client-node` library.

## Installation

```console
npm install @dot-i/k8s-operator
```

## Basic usage

### Operator class

To implement your operator and watch one or more resources, create a sub-class from `Operator`.

```javascript
import Operator from '@dot-i/k8s-operator';

export default class MyOperator extends Operator {
    protected async init() {
        // ...
    }
}
```

You can add as many watches as you want from your `init()` method, both on standard or custom resources.

Create the singleton instance of your operator in your `main()` at startup time and `start()` it. Before exiting call `stop()`.

```javascript
const operator = new MyOperator();
await operator.start();

const exit = (reason: string) => {
    operator.stop();
    process.exit(0);
};

process.on('SIGTERM', () => exit('SIGTERM'))
    .on('SIGINT', () => exit('SIGINT'));
```

### Operator methods

#### constructor

You can pass on optional logger to the constructor. It must implement this interface:

```javascript
interface IOperatorLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
}
```

#### init

```javascript
protected abstract async init(): Promise<void>
```

Implement this method on your own operator class to initialize one or more resource watches. Call either `watchResource()` or `watchCustomResource()` on as many resources as you need.

#### watchResource

```javascript
protected async watchResource(group: string, version: string, plural: string,
                              onEvent: (event: IResourceEvent) => Promise<void>): Promise<void>
```

Start watching a **Kubernetes** resource. Pass in the resource's group, version and plural name. For "core" resources `group` must be set to an empty string.

The `onEvent` callback will be called for each resource event that comes in from the **Kubernetes** API.

A resource event is defined as follows:

```javascript
interface IResourceEvent {
    meta: IResourceMeta;
    type: ResourceEventType;
    object: any;
}

interface IResourceMeta {
    name: string;
    namespace: string;
    id: string;
    resourceVersion: string;
    apiVersion: string;
    kind: string;
}

enum ResourceEventType {
    Added = 'ADDED',
    Modified = 'MODIFIED',
    Deleted = 'DELETED'
}
```

`object` will contain the actual resource object as received from the **Kubernetes** API.

#### watchCustomResource

```javascript
protected async watchCustomResource(group: string, version: string, plural: string,
                                    onEvent: (event: IResourceEvent) => Promise<void>): Promise<void>
```

Almost identical to `watchResource()` but will validate the custom resource definition exists before starting the watch.

#### setResourceStatus

```javascript
protected async setResourceStatus(meta: IResourceMeta, status: any): Promise<void>
```

If your custom resource definition contains a status section you can set the status of your resources using `setResourceStatus()`. The resource object to set the status on is identified by passing in the `meta` field from the event you received.

#### patchResourceStatus

```javascript
protected async patchResourceStatus(meta: IResourceMeta, status: any): Promise<void>
```

If your custom resource definition contains a status section you can patch the status of your resources using `patchResourceStatus()`. The resource object to set the status on is identified by passing in the `meta` field from the event you received. `status` is a JSON Merge patch object as described in **RFC 7386** (https://tools.ietf.org/html/rfc7386)

#### registerCustomResourceDefinition

```javascript
protected async registerCustomResourceDefinition(crdFile: string): Promise<{
    group: string;
    versions: any;
    plural: string;
}>
```

You can optionally register a custom resource definition from code, to auto-create it when the operator is deployed and first run.

## Examples

### Operator that watches namespaces

```javascript
import Operator, { ResourceEventType, IResourceEvent } from '@dot-i/k8s-operator';

export default class MyOperator extends Operator {
    protected async init() {
        await this.watchResource('', 'v1', 'namespaces', async (e) => {
            const object = e.object;
            const metadata = object.metadata;
            switch (e.type) {
                case ResourceEventType.Added:
                    // do something useful here
                    break;
                case ResourceEventType.Modified:
                    // do something useful here
                    break;
                case ResourceEventType.Deleted:
                    // do something useful here
                    break;
            }
        });
    }
}
```

### Operator that watches a custom resource

```javascript
import Operator, { ResourceEventType, IResourceEvent } from '@dot-i/k8s-operator';

export default class MyOperator extends Operator {
    constructor() {
        super(/* pass in optional logger*/);
    }

    protected async init() {
        // NOTE: we pass the plural name of the resource
        await this.watchCustomResource('dot-i.eu', 'v1', 'mycustomresources', async (e) => {
            switch (e.type) {
                case ResourceEventType.Added:
                case ResourceEventType.Modified:
                    return this.resourceModified(e);
                case ResourceEventType.Deleted:
                    return this.resourceDeleted(e);
            }
        });
    }

    private async resourceModified(e: IResourceEvent) {
        const object = e.object;
        const metadata = object.metadata;

        if (!object.status || object.status.observedGeneration !== metadata.generation) {

            // TODO: handle resource modification here

            await this.setResourceStatus(e.meta, {
                observedGeneration: metadata.generation
            });
        }
    }

    private async resourceDeleted(e: IResourceEvent) {
        // TODO: handle resource deletion here
    }
}
```

### Register a custom resource definition from the operator

It is possible to register a custom resource definition directly from the operator code, from your `init()` method.

```javascript
import * as Path from 'path';

export default class MyCustomResourceOperator extends Operator {
    protected async init() {
        const crdFile = Path.resolve(__dirname, '..', 'your-crd.yaml');
        const { group, versions, plural } = await this.registerCustomResourceDefinition(crdFile);
        await this.watchCustomResource(group, versions[0].name, plural, async (e) => {
            // ...
        });
    }
}
```

## Development

All dependencies of this project are expressed in its [`package.json`](package.json) file. Before you start developing, ensure
that you have [NPM](https://www.npmjs.com/) installed, then run:

```console
npm install
```

### Formatting

Install an editor plugin like [https://github.com/prettier/prettier-vscode](https://github.com/prettier/prettier-vscode) and [https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig](https://marketplace.visualstudio.com/items?itemName=EditorConfig.EditorConfig).

### Linting

Run `npm run lint` or install an editor plugin like [https://github.com/Microsoft/vscode-typescript-tslint-plugin](https://github.com/Microsoft/vscode-typescript-tslint-plugin).
