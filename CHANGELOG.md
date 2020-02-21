# CHANGELOG

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
