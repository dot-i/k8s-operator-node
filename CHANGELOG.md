# CHANGELOG

### 1.3.8 (2023-03-21)

- bump @kubernetes/client-node to 0.18.1
- bump gaxios to 5.1.0

### 1.3.7 (2023-01-20)

- bump @kubernetes/client-node to 0.18.0

### 1.3.6 (2022-12-14)

- bump qs from 6.5.2 to 6.5.3

### 1.3.5 (2022-09-19)

- upgrade dependencies

### 1.3.4 (2022-09-19)

- (dependabot) bump jose from 4.8.3 to 4.9.3

### 1.3.3 (2022-08-29)

- made 'logger' protected
- upgrade dev dependencies

### 1.3.2 (2022-07-06)

- upgrade dependencies

### 1.3.1 (2022-06-23)

- upgrade dependencies

### 1.3.0 (2022-05-03)

- support Node 12 or higher
- switch from axios to gaxios
- add new applyGaxiosKubeConfigAuth() method

### 1.2.3 (2022-02-15)

- upgrade dependencies

### 1.2.2 (2022-02-02)

- upgrade dependencies
- removed use of serialize-error

### 1.2.1 (2022-01-16)

- fix vulnerabilities
- upgrade dependencies

### 1.2.0 (2021-11-25)

- upgrade @kubernetes/client-node to 0.16.1
- upgrade dependencies
- remove support for v1beta1 CRDs

### 1.1.7 (2021-09-29)

- upgrade dependencies

### 1.1.6 (2021-09-06)

- upgrade @kubernetes/client-node to 0.15.1
- upgrade async to 3.2.1
- upgrade axios to 0.21.3

### 1.1.5 (2021-08-05)

- fix CVE-2021-32803
- update @kubernetes/client-node to 0.15.0
- eliminate js-yaml dependency

### 1.1.4 (2021-06-15)

- update dependencies

### 1.1.3 (2021-04-29)

- update @kubernetes/client-node to 0.14.3
- update other dependencies

### 1.1.1 (2021-02-22)

- update @kubernetes/client-node to 0.14.0

### 1.1.0 (2021-01-20)

- support both apiextensions.k8s.io/v1 and apiextensions.k8s.io/v1beta1
- updated dependencies

### 1.0.19 (2021-01-06)

- removed local `ForeverWatch` (obsolete due to latest `@kubernetes/client-node`)
- updated dependencies

### 1.0.17 (2020-12-01)

- using a local `ForeverWatch` until newer `@kubernetes/client-node` is released
- updated dependencies

### 1.0.16 (2020-10-26)

- fixed usage of 'serialize-error'
- updated dependencies

### 1.0.15 (2020-10-26)

- use 'serialize-error' to log errors

### 1.0.14 (2020-10-22)

- replaced direct dependency on 'request' with 'axios'

### 1.0.13 (2020-09-22)

- added stream-buffers to dependencies

### 1.0.12 (2020-09-19)

- updated @kubernetes/client-node to fix security issue found in node-forge

### 1.0.11 (2020-09-13)

- reliability enhancement: end process on watch error now (to force a pod restart)
- upgraded to TypeScript 4.0

### 1.0.10 (2020-08-27)

- updated devDependencies

### 1.0.9 (2020-08-17)

- updated dependencies

### 1.0.8 (2020-07-18)

- updated to latest `lodash` to fix vulnerability

### 1.0.7 (2020-07-13)

- added an `export` to `ResourceMetaImpl`

### 1.0.6 (2020-06-19)

- fixed missing await on kubeConfig.applyToRequest()

### 1.0.5 (2020-06-19)

- update dependencies

### 1.0.4 (2020-05-18)

- Some small tweaking to make error-handling on watches as robust as possible
- Added two debug logs for restarting a watch

### 1.0.3 (2020-05-18)

- `watchResource()` now has an optional `namespace` parameter
- updated dependencies

### 1.0.2 (2020-05-04)

- updated dependency on @kubernetes/client-node to 0.11.2

### 1.0.1 (2020-04-06)

- fixed minimist security advisory warning

### 1.0.0 (2020-03-25)

- graduated to stable
- upgraded some dependencies

### 0.6.1 (2020-02-21)

- back to using `request-promise-native`

### 0.6.0 (2020-02-21)

- removed dependency on `request-promise-native`
- upgraded all dependencies

### 0.5.1 (2019-09-25)

- tweaked `handleResourceFinalizer()` to always return 'true' if the resource is marked for deletion

#### 0.5.0 (2019-09-24)

- switched to ESLint _(TSLint is deprecated)_
- some small breaking changes to interface names due to compliance with standard ESLint rules now (`ResourceEvent`, `ResourceMeta` and `OperatorLogger`)

#### 0.4.0 (2019-09-17)

- added `handleResourceFinalizer()` and `setResourceFinalizers()` to easily implement robust handling of the deletion a resource (using finalizers).

#### 0.3.0 (2019-09-13)

- Removed `watchCustomResource()` as it made little sense to use this in practice due to the required permissions. Just use `watchResource()`.
- Small tweaks.

#### 0.3.1 (2019-09-13)

- Removed `watchCustomResource()` from `README.md`.
- Updated to TypeScript 3.6.3.

#### 0.2.0 (2019-09-03)

- Added `patchResourceStatus()` to patch a status object rather than having to set it completely every time.
- Fixed problem with all events running in parallel due to async/await. They are processed consecutively now.

#### 0.1.0 (2019-07-15)

- Initial release.
