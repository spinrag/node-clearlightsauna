# Changelog

## [2.4.0](https://github.com/spinrag/node-clearlightsauna/compare/v2.2.0...v2.4.0) (2026-09-12)


### ♨️ Features

* **BACKEND:** add /device/start and /device/stop HTTP endpoints ([900393b](https://github.com/spinrag/node-clearlightsauna/commit/900393b27a0db1a9f1b84f81e0a01e4a24e7f5d3))
* **BACKEND:** add separate API_KEY for URL query param auth ([4a6f468](https://github.com/spinrag/node-clearlightsauna/commit/4a6f468fecbe2f7761553dc763f8ccaa55e06bfb))
* **FRONTEND:** instant feedback when arming pre-heat ([3365a49](https://github.com/spinrag/node-clearlightsauna/commit/3365a49da373883e448ec0ef411f29c2e8930fa9))
* **FRONTEND:** pre-heat confirm flow with hour/minute delay input ([503e8c1](https://github.com/spinrag/node-clearlightsauna/commit/503e8c1a0372059156e6b99a33488155a6c68527))
* **GRAFANA:** add time-to-temp estimate panels ([9ef21e8](https://github.com/spinrag/node-clearlightsauna/commit/9ef21e86b455d947180b6a9cac202fb8e29a4ce6))
* **GRAFANA:** effective-rate estimate + last-session panel; 4-across cards ([acd8636](https://github.com/spinrag/node-clearlightsauna/commit/acd86364576081bbc1c897c939230b8a42822319))
* **GRAFANA:** last-session time-to-target panel; rate excludes pre-heat ([20964b7](https://github.com/spinrag/node-clearlightsauna/commit/20964b7a3761e1bf4dc549299852f3b8223e13e0))
* **HEALTH:** report version and commit from backend and frontend ([3a8f145](https://github.com/spinrag/node-clearlightsauna/commit/3a8f1451a4bb0f88f0562fe5f563e13bc69278f9))
* **PREHEAT:** implement working delayed-start pre-heat with backend fallback ([06dbcad](https://github.com/spinrag/node-clearlightsauna/commit/06dbcadecd5d326804ae2c2e8a23667031c37bb5))
* **STATS:** log sauna stats to InfluxDB for heat-up timing ([546d01a](https://github.com/spinrag/node-clearlightsauna/commit/546d01a75fc2dbbb30ed486b13e6fc9d87389f1a))


### 🧊 Bug Fixes

* **ACCESS:** serve the API same-origin and recover expired Access sessions ([b4d9626](https://github.com/spinrag/node-clearlightsauna/commit/b4d9626f3eba3f875899034e1cf3a01b1e957e59))
* **CI:** restore pnpm version parameter in action-setup ([f52c7a6](https://github.com/spinrag/node-clearlightsauna/commit/f52c7a644222bb31e27f5390e1ca9cdc7ee8561a))
* **DEPS:** patch production-tier dependency vulnerabilities ([df5e943](https://github.com/spinrag/node-clearlightsauna/commit/df5e9439ac70e1792c3c64197c806116b8f127a5))
* **DEPS:** patch remaining dev/build-tooling vulnerabilities ([08a5be1](https://github.com/spinrag/node-clearlightsauna/commit/08a5be1281f0e5f71099cf358700f7a87f36b347))
* **GRAFANA:** base heat-up rate on power-on periods only ([fb50fa0](https://github.com/spinrag/node-clearlightsauna/commit/fb50fa0b974a858e85d0fd2b7093a9562d043a6d))
* **GRAFANA:** render boolean flags in stat/timeline panels ([6376f68](https://github.com/spinrag/node-clearlightsauna/commit/6376f685bfc0e7047f090c9a2d5aa85413a819a9))
* **NOTIFY:** only send threshold alerts while powered on ([7571006](https://github.com/spinrag/node-clearlightsauna/commit/75710061af01a13eb10d9e9eb3214c3da405f749)), closes [#10](https://github.com/spinrag/node-clearlightsauna/issues/10)
* **PWA:** stop stale cache masking Access logins; stamp SW version at build ([ed2a8b2](https://github.com/spinrag/node-clearlightsauna/commit/ed2a8b28cb057eb8f6c564482a6c9dbca22d401a))


### ⚙️ CICD

* **CI:** bump actions/checkout and actions/setup-node to v5 (Node 24) ([08cb7d5](https://github.com/spinrag/node-clearlightsauna/commit/08cb7d5068dbfd4a1147c68c9d1e0104e99ccb05))
* **CI:** bump pnpm/action-setup to v4.1 to fix Node.js 20 deprecation warning ([6516d82](https://github.com/spinrag/node-clearlightsauna/commit/6516d82e4e3629b0e936ceb5db41330b2c87fb7e))
* **CI:** bump pnpm/action-setup to v4.4.0 for Node.js 24 runtime ([0aaf363](https://github.com/spinrag/node-clearlightsauna/commit/0aaf363edd4762415ef2a21194a604e445346cbb))
* **CI:** bump pnpm/action-setup to v5 ([8ca99bb](https://github.com/spinrag/node-clearlightsauna/commit/8ca99bb299c3c1b15d604ccd74a78000b5c2bffa))


### 🪵 Chore

* **deps:** dotenv 17 ([431a9e4](https://github.com/spinrag/node-clearlightsauna/commit/431a9e4a516739a86e5e170bbc7e5d9a1759ef86))
* **deps:** eslint 10 stack (eslint, @eslint/js, globals, prettier-plugin-svelte) ([0702737](https://github.com/spinrag/node-clearlightsauna/commit/0702737742f72d979a6b14bdeb8335c1eb5ed685))
* **deps:** FontAwesome 7 ([590d652](https://github.com/spinrag/node-clearlightsauna/commit/590d652e87d970ebbe4be5a089c1ad93360c6c71))
* **deps:** routine non-major refresh ([0724372](https://github.com/spinrag/node-clearlightsauna/commit/0724372f7cce28342df84e3c0bf6deccd9965cbd))
* **deps:** typescript 6 + fix surfaced type errors ([c97dbea](https://github.com/spinrag/node-clearlightsauna/commit/c97dbeaf3d19c24ca8d12bfe65b53c3b901315d2))
* **deps:** vite 8 + vite-plugin-svelte 7 + adapter-auto 7 ([633432c](https://github.com/spinrag/node-clearlightsauna/commit/633432c2324eaf53c0dd0348ae1ecaf563c8f1a2))
* **REPO:** gitignore test coverage output ([dbae506](https://github.com/spinrag/node-clearlightsauna/commit/dbae506c7d134cd4a7a8e416c5d5150dd4d0b1b3))


### 💨 Performance

* **PREHEAT:** cut inter-write gap to 150ms; tolerate lost acks ([7e6c80c](https://github.com/spinrag/node-clearlightsauna/commit/7e6c80cc9ab0f7191001bc8adf16cd70d52a46d9))
* **PREHEAT:** write only changed settings when arming ([350233f](https://github.com/spinrag/node-clearlightsauna/commit/350233f582a02fba2736e4a7cc8a6a3378b8edf4))


### 📝 Docs

* **DEPLOY:** add redeploy runbook ([5f5618a](https://github.com/spinrag/node-clearlightsauna/commit/5f5618aa2d9f1aee7e3dc8684b84565975d999ae))
* **DEPLOY:** clarify env file must be backend/.env, not root .env ([9122c12](https://github.com/spinrag/node-clearlightsauna/commit/9122c12697a1d57017010f13e599944affd215ee))
* **ENV:** split env examples per package, drop misleading root .env.example ([208c80b](https://github.com/spinrag/node-clearlightsauna/commit/208c80b308817d45b083c6fe6449f5b3bcdca62d))
* **GRAFANA:** add importable sauna dashboard + setup guide ([0884d46](https://github.com/spinrag/node-clearlightsauna/commit/0884d463a598518c0819040a32aaf21660517652))

## [2.2.0](https://github.com/spinrag/node-clearlightsauna/compare/v2.1.5...v2.2.0) (2026-03-17)


### ♨️ Features

* **BACKEND:** add push endpoint tests, fix broken DELETE unsubscribe ([e762cb7](https://github.com/spinrag/node-clearlightsauna/commit/e762cb7ae132fb577467c53cef4656a4b179dd83))


### 🧊 Bug Fixes

* **BACKEND:** remove dead control echo listener and non-existent device methods ([4f4cd28](https://github.com/spinrag/node-clearlightsauna/commit/4f4cd283e759050128132f0e4064110a95026cca)), closes [#6](https://github.com/spinrag/node-clearlightsauna/issues/6) [#7](https://github.com/spinrag/node-clearlightsauna/issues/7)


### ⚙️ Tests

* **BACKEND:** add device lifecycle and control tests ([2af4e33](https://github.com/spinrag/node-clearlightsauna/commit/2af4e33134dfaf6680e5c1a08e7f23bb2a38afc5))
* **BACKEND:** add Socket.IO handler tests ([1737947](https://github.com/spinrag/node-clearlightsauna/commit/1737947044cb4cf4373f0f20f4af4930b8ac0154))


### ⚙️ CICD

* **CI:** add coverage reporting with 70% line threshold ([b828ec1](https://github.com/spinrag/node-clearlightsauna/commit/b828ec117da73f7dfd2bf4982ad928a78bb1f3b8))

## [2.1.5](https://github.com/spinrag/node-clearlightsauna/compare/v2.1.4...v2.1.5) (2026-03-16)


### 🪵 Chore

* **CHANGELOG:** replace space-themed emojis with sauna-themed ones ([2990670](https://github.com/spinrag/node-clearlightsauna/commit/299067066ec1aac80c80bdf793661f8b1d48737c))

## [2.1.4](https://github.com/spinrag/node-clearlightsauna/compare/v2.1.3...v2.1.4) (2026-03-16)


### ♨️ Features

* **NOTIFICATIONS:** persist threshold state, add tests, update README ([b116eb5](https://github.com/spinrag/node-clearlightsauna/commit/b116eb5156ca335ba249bb5ffa748587ce53606f))

## [2.1.3](https://github.com/spinrag/node-clearlightsauna/compare/v2.1.2...v2.1.3) (2026-03-16)


### 🧊 Bug Fixes

* **BACKEND:** prevent duplicate notifications from hysteresis re-arm ([fed2f92](https://github.com/spinrag/node-clearlightsauna/commit/fed2f92a19d3fcab6ad4d563b93faba92707b2b1))

## [2.1.2](https://github.com/spinrag/node-clearlightsauna/compare/v2.1.1...v2.1.2) (2026-03-16)


### 🧊 Bug Fixes

* **BACKEND:** log client IP on Socket.IO connect, disconnect, and auth failures ([daf0c5f](https://github.com/spinrag/node-clearlightsauna/commit/daf0c5f7d113dd587a282b1f50b4e5021c6d89e7))
* **FRONTEND:** prevent Socket.IO connection during SSR, bump cache version ([d8a6add](https://github.com/spinrag/node-clearlightsauna/commit/d8a6addb365cef40a7022069a3f5609d5b3db52b))

## [2.1.1](https://github.com/spinrag/node-clearlightsauna/compare/v2.1.0...v2.1.1) (2026-03-16)


### 🧊 Bug Fixes

* **FRONTEND:** bump service worker CACHE_VERSION to v2 for deploy ([e8b7946](https://github.com/spinrag/node-clearlightsauna/commit/e8b7946c54c6f533a76ce4e8f78fc8f739485595))

## [2.1.0](https://github.com/spinrag/node-clearlightsauna/compare/v2.0.0...v2.1.0) (2026-03-16)


### ♨️ Features

* **NOTIFICATIONS:** add Web Push temperature threshold notifications ([95afdfe](https://github.com/spinrag/node-clearlightsauna/commit/95afdfe746b9ede0941c3f52fb52588e1768c08d))


### 🧊 Bug Fixes

* **FRONTEND:** mark touchstart listener as non-passive explicitly ([b55b5cd](https://github.com/spinrag/node-clearlightsauna/commit/b55b5cd84f091b0591804d86fc8edb62a063adde))


### 🪵 Chore

* update node-gizwits submodule (resolve npm audit vulnerabilities) ([f559622](https://github.com/spinrag/node-clearlightsauna/commit/f559622b01e5000fb71c4f1d66aecad9852a132c))

## [2.0.0](https://github.com/spinrag/node-clearlightsauna/compare/v1.0.0...v2.0.0) (2026-03-10)


### ♨️ Features

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


### 🧊 Bug Fixes

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


### ⚙️ CICD

* add GitHub Actions workflow for backend tests and frontend lint ([a01622b](https://github.com/spinrag/node-clearlightsauna/commit/a01622bdfd881be389182b5b287666916d5da900))


### 🪵 Chore

* **BACKEND:** remove redundant socketIo import ([4f38fd2](https://github.com/spinrag/node-clearlightsauna/commit/4f38fd24ea58699b2d9ca7553258ed514401351a))
* clean up .gitignore duplicates and organize by category ([62ebacb](https://github.com/spinrag/node-clearlightsauna/commit/62ebacbfd5fd81f104e59d44107e6d9d98bf727c))
* improve .env docs, add aria-labels, handle socket connect errors ([791e05e](https://github.com/spinrag/node-clearlightsauna/commit/791e05e7fc77a5dffca51d415d188981bde23639))
* update node-gizwits submodule (fix noisy console.log) ([26b1154](https://github.com/spinrag/node-clearlightsauna/commit/26b11542282bc72621388f8a707d8a03a6c60239))
* update node-gizwits submodule (timeout error handling, package name fix) ([0e7b889](https://github.com/spinrag/node-clearlightsauna/commit/0e7b88987368b129b64f9ba2567b6fd7a3ff852d))
* update pnpm-lock.yaml for @eslint/js dependency ([757de71](https://github.com/spinrag/node-clearlightsauna/commit/757de71c3332671edee85956b6340580957c659e))


### 💨 Refactor

* **BACKEND:** replace prototype UI with status page ([288c0f2](https://github.com/spinrag/node-clearlightsauna/commit/288c0f2b86ecb68880cce6ddf6815f56c4dcdcf1))
* **FRONTEND:** extract StepButton component, consolidate state ([dbb2dca](https://github.com/spinrag/node-clearlightsauna/commit/dbb2dcabbf6d3157ab1d970983eb8f30cdd0834c))

## 1.0.0 (2025-09-20)

### ♨️ Features

* add initial controls ([0061deb](https://github.com/spinrag/node-clearlightsauna/commit/0061deb))
* add support for PWA ([9f1124a](https://github.com/spinrag/node-clearlightsauna/commit/9f1124a))
* add devMode to silence on built versions ([29bc283](https://github.com/spinrag/node-clearlightsauna/commit/29bc283))
* **frontend:** close [#1](https://github.com/spinrag/node-clearlightsauna/issues/1) add support for PWA ([e0cf70d](https://github.com/spinrag/node-clearlightsauna/commit/e0cf70d))
* close [#7](https://github.com/spinrag/node-clearlightsauna/issues/7) to add support for press/hold on buttons ([cc0032f](https://github.com/spinrag/node-clearlightsauna/commit/cc0032f))
* upgrade tailwindcss to v4 ([b475556](https://github.com/spinrag/node-clearlightsauna/commit/b475556))
* generalize CORS domain wildcard settings for any subdomain ([d4beee4](https://github.com/spinrag/node-clearlightsauna/commit/d4beee4))
* move to winston for backend logging ([ee15efb](https://github.com/spinrag/node-clearlightsauna/commit/ee15efb))

### 🧊 Bug Fixes

* correct zoom and background for PWA ([ecf26db](https://github.com/spinrag/node-clearlightsauna/commit/ecf26db))
* change PWA status bar to just black ([b7bd082](https://github.com/spinrag/node-clearlightsauna/commit/b7bd082))
* **frontend:** PWA theme color in app.html ([d043936](https://github.com/spinrag/node-clearlightsauna/commit/d043936))
* **frontend:** fix [#1](https://github.com/spinrag/node-clearlightsauna/issues/1) for PWA zoom, background and theme colors ([0b7d794](https://github.com/spinrag/node-clearlightsauna/commit/0b7d794))
* disable default select behavior on buttons for press and hold function ([70bf106](https://github.com/spinrag/node-clearlightsauna/commit/70bf106))
* limit set time to 60 minutes until SET_HOUR is fixed in backend ([86f7159](https://github.com/spinrag/node-clearlightsauna/commit/86f7159))
* problem with SET_MINUTE ([05d8335](https://github.com/spinrag/node-clearlightsauna/commit/05d8335))

### 🌡️ Improvements

* make pre-heat and set temp controls smoother ([ee3c4cc](https://github.com/spinrag/node-clearlightsauna/commit/ee3c4cc))

### 🪵 Chore

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
