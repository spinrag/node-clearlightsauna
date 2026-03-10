# Changelog

## [2.0.0](https://github.com/spinrag/node-clearlightsauna/compare/v1.0.0...v2.0.0) (2026-03-10)


### 🚀🚀 Features

* add /health endpoint and migrate toggleButton to Svelte 5 ([2da3168](https://github.com/spinrag/node-clearlightsauna/commit/2da3168dbea51f0e61f3efd7a462e0602148c2f5))
* add connection status indicators and error banners ([f531878](https://github.com/spinrag/node-clearlightsauna/commit/f53187832ffb066f248247e19f87312e85ce787b))
* **BACKEND:** add control payload validation module and tests ([5d4ff83](https://github.com/spinrag/node-clearlightsauna/commit/5d4ff8384e6f6395e29ed0449ff320cb59fea8a4))
* **BACKEND:** add HTTP Bearer token auth on /device/* routes ([77a5c63](https://github.com/spinrag/node-clearlightsauna/commit/77a5c6329f32cb2a13f0acbebfc6e5fbc8aa4ab7))
* **BACKEND:** add Socket.IO handshake auth middleware ([86dbebc](https://github.com/spinrag/node-clearlightsauna/commit/86dbebcf206cdec5a381ae01028140abd6d35cff))
* **BACKEND:** start server before device connection, handle reconnects ([0566d0b](https://github.com/spinrag/node-clearlightsauna/commit/0566d0b1b6f4dc55a4c577181c798b92d5ded9f3))
* **BACKEND:** warn on broad CORS wildcards in production ([b01f989](https://github.com/spinrag/node-clearlightsauna/commit/b01f98960d561724bbaec00a94cc0a71d078a947))
* **BACKEND:** wire payload validation into HTTP and Socket.IO control endpoints ([b2c5c64](https://github.com/spinrag/node-clearlightsauna/commit/b2c5c64f5acbc73d60cdfd315bb4277a1c503c2b))
* **FRONTEND:** implement service worker caching and update notifications ([db042d2](https://github.com/spinrag/node-clearlightsauna/commit/db042d27ad44e1b31a53dd56722f70b59e0c9f6d))
* use node-gizwits as git submodule, update README and add .env.example ([74fafa7](https://github.com/spinrag/node-clearlightsauna/commit/74fafa70e9e16dae2c4c4fb4e1c373a7d6adc181))


### 👽 Bug Fixes

* **BACKEND:** drop overlapping device commands instead of queuing ([87ec4ba](https://github.com/spinrag/node-clearlightsauna/commit/87ec4ba16155dd832b0dbf6c6c20d0ec1149ed6f))
* **BACKEND:** queue rapid-fire device commands to prevent overlap errors ([3a05690](https://github.com/spinrag/node-clearlightsauna/commit/3a05690e7e15b6b078c535d973e045fb838816c1))
* **BACKEND:** standardize HTTP responses and add socket control ack ([9364777](https://github.com/spinrag/node-clearlightsauna/commit/9364777e0ee1035fbc84d3e4552635f252226e73))
* better error handling on timeouts and clean up connectiosn on disconnects ([74c2812](https://github.com/spinrag/node-clearlightsauna/commit/74c2812eab72136e7100ebae0d168fe6fe2844d8))
* **ci:** use pnpm for backend tests, install submodule dependencies ([0a26a06](https://github.com/spinrag/node-clearlightsauna/commit/0a26a066a29465d3d7ccff9f049017e952529189))
* **FRONTEND:** clean up socket listeners on component destroy ([91064a6](https://github.com/spinrag/node-clearlightsauna/commit/91064a67efa1ea574a17f4e658da2aab5340bfdb))
* **FRONTEND:** fix time adjustment bugs and remove debug leftover ([6e8c87b](https://github.com/spinrag/node-clearlightsauna/commit/6e8c87bc675868cc24fb955086e8ee097f79112a))
* **FRONTEND:** remove unused imports/variables, add @eslint/js, run prettier ([d9529a7](https://github.com/spinrag/node-clearlightsauna/commit/d9529a7c96935044a9eff2925f8129a7521d4c77))
* **FRONTEND:** resolve Svelte 5 deprecation warnings ([02df37c](https://github.com/spinrag/node-clearlightsauna/commit/02df37ccfc4332177a337eebba318b4f804d7618))
* **security:** resolve all pnpm audit vulnerabilities ([45defbf](https://github.com/spinrag/node-clearlightsauna/commit/45defbffedf7c178774e9a695b9c1520a08c0a3f))


### 🌠 CICD

* add GitHub Actions workflow for backend tests and frontend lint ([a01622b](https://github.com/spinrag/node-clearlightsauna/commit/a01622bdfd881be389182b5b287666916d5da900))


### 🛰️ Chore

* **BACKEND:** remove redundant socketIo import ([4f38fd2](https://github.com/spinrag/node-clearlightsauna/commit/4f38fd24ea58699b2d9ca7553258ed514401351a))
* clean up .gitignore duplicates and organize by category ([62ebacb](https://github.com/spinrag/node-clearlightsauna/commit/62ebacbfd5fd81f104e59d44107e6d9d98bf727c))
* improve .env docs, add aria-labels, handle socket connect errors ([791e05e](https://github.com/spinrag/node-clearlightsauna/commit/791e05e7fc77a5dffca51d415d188981bde23639))
* update node-gizwits submodule (fix noisy console.log) ([26b1154](https://github.com/spinrag/node-clearlightsauna/commit/26b11542282bc72621388f8a707d8a03a6c60239))
* update node-gizwits submodule (timeout error handling, package name fix) ([0e7b889](https://github.com/spinrag/node-clearlightsauna/commit/0e7b88987368b129b64f9ba2567b6fd7a3ff852d))
* update pnpm-lock.yaml for @eslint/js dependency ([757de71](https://github.com/spinrag/node-clearlightsauna/commit/757de71c3332671edee85956b6340580957c659e))


### 🛰️ Refactor

* **BACKEND:** replace prototype UI with status page ([288c0f2](https://github.com/spinrag/node-clearlightsauna/commit/288c0f2b86ecb68880cce6ddf6815f56c4dcdcf1))
* **FRONTEND:** extract StepButton component, consolidate state ([dbb2dca](https://github.com/spinrag/node-clearlightsauna/commit/dbb2dcabbf6d3157ab1d970983eb8f30cdd0834c))

## 1.0.0 (2025-09-20)

### 🚀🚀 Features

* add initial controls ([0061deb](https://github.com/spinrag/node-clearlightsauna/commit/0061deb))
* add support for PWA ([9f1124a](https://github.com/spinrag/node-clearlightsauna/commit/9f1124a))
* add devMode to silence on built versions ([29bc283](https://github.com/spinrag/node-clearlightsauna/commit/29bc283))
* **frontend:** close [#1](https://github.com/spinrag/node-clearlightsauna/issues/1) add support for PWA ([e0cf70d](https://github.com/spinrag/node-clearlightsauna/commit/e0cf70d))
* close [#7](https://github.com/spinrag/node-clearlightsauna/issues/7) to add support for press/hold on buttons ([cc0032f](https://github.com/spinrag/node-clearlightsauna/commit/cc0032f))
* upgrade tailwindcss to v4 ([b475556](https://github.com/spinrag/node-clearlightsauna/commit/b475556))
* generalize CORS domain wildcard settings for any subdomain ([d4beee4](https://github.com/spinrag/node-clearlightsauna/commit/d4beee4))
* move to winston for backend logging ([ee15efb](https://github.com/spinrag/node-clearlightsauna/commit/ee15efb))

### 👽 Bug Fixes

* correct zoom and background for PWA ([ecf26db](https://github.com/spinrag/node-clearlightsauna/commit/ecf26db))
* change PWA status bar to just black ([b7bd082](https://github.com/spinrag/node-clearlightsauna/commit/b7bd082))
* **frontend:** PWA theme color in app.html ([d043936](https://github.com/spinrag/node-clearlightsauna/commit/d043936))
* **frontend:** fix [#1](https://github.com/spinrag/node-clearlightsauna/issues/1) for PWA zoom, background and theme colors ([0b7d794](https://github.com/spinrag/node-clearlightsauna/commit/0b7d794))
* disable default select behavior on buttons for press and hold function ([70bf106](https://github.com/spinrag/node-clearlightsauna/commit/70bf106))
* limit set time to 60 minutes until SET_HOUR is fixed in backend ([86f7159](https://github.com/spinrag/node-clearlightsauna/commit/86f7159))
* problem with SET_MINUTE ([05d8335](https://github.com/spinrag/node-clearlightsauna/commit/05d8335))

### 🚀 Improvements

* make pre-heat and set temp controls smoother ([ee3c4cc](https://github.com/spinrag/node-clearlightsauna/commit/ee3c4cc))

### 🛰️ Chore

* initial commit ([5b12aa6](https://github.com/spinrag/node-clearlightsauna/commit/5b12aa6))
* move to adapter-node for sveltekit adapter ([bdaeb13](https://github.com/spinrag/node-clearlightsauna/commit/bdaeb13))
* remove dependencies from root package.json ([28950c3](https://github.com/spinrag/node-clearlightsauna/commit/28950c3))
* close [#6](https://github.com/spinrag/node-clearlightsauna/issues/6) for donate button ([ae7f9c1](https://github.com/spinrag/node-clearlightsauna/commit/ae7f9c1))
* update packages ([a16af4c](https://github.com/spinrag/node-clearlightsauna/commit/a16af4c))
* remove semi-colons ([8f60174](https://github.com/spinrag/node-clearlightsauna/commit/8f60174))
* update packages for backend service ([517de2b](https://github.com/spinrag/node-clearlightsauna/commit/517de2b))
* update frontend packages ([0874c64](https://github.com/spinrag/node-clearlightsauna/commit/0874c64))
* remove semi-colons and improve logger formatting ([b46116a](https://github.com/spinrag/node-clearlightsauna/commit/b46116a))
* add LICENSE ([815cd12](https://github.com/spinrag/node-clearlightsauna/commit/815cd12))

### 📝 Docs

* add README.md ([af49109](https://github.com/spinrag/node-clearlightsauna/commit/af49109))
* update README to list Node.js v22 or higher as required ([ffba3de](https://github.com/spinrag/node-clearlightsauna/commit/ffba3de))
