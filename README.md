# Zotero Metadata Search Plugin

[![zotero target version](https://img.shields.io/badge/Zotero-7-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org)
[![Using Zotero Plugin Template](https://img.shields.io/badge/Using-Zotero%20Plugin%20Template-blue?style=flat-square&logo=github)](https://github.com/windingwind/zotero-plugin-template)

Update Zotero items with metadata from bibliographic databases like CrossRef.org and DBLP.org. If you want to add more search engines, pull requests are welcome, look at `searchCrossRef()` in `metadataSearchPlugin.js` as an example.

# Installation

Download the latest .xpi file from the [releases page](https://github.com/ajdavis/zotero-metadata-search-plugin/releases) and follow [Zotero's instructions for installing it](https://www.zotero.org/support/plugins).

# Development

This plugin code's is based on windingwind's [Zotero plugin template](https://github.com/windingwind/zotero-plugin-template), and so is this development guide.

- Documentation for plugins development
  - [📖 Plugin Development Documentation](https://zotero-chinese.com/plugin-dev-guide/) (Chinese, not yet complete)
  - [📖 Plugin Development Documentation for Zotero 7](https://www.zotero.org/support/dev/zotero_7_for_developers)
- Tools for plugins development
  - [🛠️ Zotero Plugin Toolkit](https://github.com/windingwind/zotero-plugin-toolkit) | [API Documentation](https://github.com/windingwind/zotero-plugin-toolkit/blob/master/docs/zotero-plugin-toolkit.md)
  - [🛠️ Zotero Plugin Scaffold](https://github.com/northword/zotero-plugin-scaffold)
  - [ℹ️ Zotero Type Definitions](https://github.com/windingwind/zotero-types)
  - [📜 Zotero Source Code](https://github.com/zotero/zotero)
  - [📌 Zotero Plugin Template](https://github.com/windingwind/zotero-plugin-template)

## Quick Start Guide

### 0 Requirements

1. Install a beta version of Zotero: <https://www.zotero.org/support/beta_builds>
2. Install [Node.js latest LTS version](https://nodejs.org/en/) and [Git](https://git-scm.com/)

> [!note]
> This guide assumes that you have an initial understanding of the basic structure and workings of the Zotero plugin. If you don't, please refer to the [documentation](https://www.zotero.org/support/dev/zotero_7_for_developers) and official plugin examples [Make It Red](https://github.com/zotero/make-it-red) first.

### 1 Create Your Repo

Git clone this repo and enter the repo folder.

Copy the environment variable file. Modify the commands that starts your installation of the beta Zotero.

> Create a development profile (Optional)  
> Start the beta Zotero with `/path/to/zotero -p`. Create a new profile and use it as your development profile. Do this only once

```sh
cp .env.example .env
$EDITOR .env
```

If you are developing more than one plugin, you can store the bin path and profile path in the system environment variables, which can be omitted here.

Install dependencies with `npm install`

> If you are using `pnpm` as the package manager for your project, you need to add `public-hoist-pattern[]=*@types/bluebird*` to `.npmrc`, see <https://github.com/windingwind/zotero-types?tab=readme-ov-file#usage>.

If you get `npm ERR! ERESOLVE unable to resolve dependency tree` with `npm install`, which is an upstream dependency bug of typescript-eslint, use the `npm i -f` command to install it.

### 2 Coding

Start development server with `npm start`, it will:

- Prebuild the plugin in development mode
- Start Zotero with plugin loaded from `build/`
- Watch `src/**` and `addon/**`, rebuild and reload plugin in Zotero when source code changed.

#### Auto Hot Reload

Tired of endless restarting? Forget about it!

1. Run `npm start`.
2. Coding. (Yes, that's all)

When file changes are detected in `src` or `addon`, the plugin will be automatically compiled and reloaded.

#### Debug in Zotero

You can also:

- Test code snippets in Tools -> Developer -> Run Javascript;
- Debug output with `Zotero.debug()`. Find the outputs in Help->Debug Output Logging->View Output;
- Debug UI. Zotero is built on the Firefox XUL framework. Debug XUL UI with software like [XUL Explorer](https://udn.realityripple.com/docs/Archive/Mozilla/XUL_Explorer).
  > XUL Documentation: <http://www.devdoc.net/web/developer.mozilla.org/en-US/docs/XUL.html>

### 3 Build

Run `npm run build` to build the plugin in production mode. The build output will be located in the `.scaffold/build/` directory.

For detailed build steps, refer to the [zotero-plugin-scaffold documentation](https://northword.github.io/zotero-plugin-scaffold/build.html). In short, the process can be divided into the following steps:

- Create or clear the `build/` directory
- Copy `addon/**` to `.scaffold/build/addon/**`
- Replace placeholders: substitute keywords and configurations defined in `package.json`
- Prepare localization files to avoid conflicts (see the [zotero_7_for_developers](https://www.zotero.org/support/dev/zotero_7_for_developers#avoiding_localization_conflicts) for more information):
  - Rename `**/*.flt` to `**/${addonRef}-*.flt`
  - Prefix each message with `addonRef-`
  - Generate type declaration files for FTL messages
- Prepare preferences files: prefix preference keys with `package.json#prefsPrefix` and generate type declaration files for preferences
- Use ESBuild to compile `.ts` source code to `.js`, building from `src/index.ts` to `.scaffold/build/addon/content/scripts`
- _(Production mode only)_ Compress the `.scaffold/build/addon` directory into `.scaffold/build/*.xpi`
- _(Production mode only)_ Prepare `update.json` or `update-beta.json`

> [!note]
>
> **What's the difference between dev & prod?**
>
> - This environment variable is stored in `Zotero.${addonInstance}.data.env`. The outputs to console is disabled in prod mode.
> - You can decide what users cannot see/use based on this variable.
> - In production mode, the build script will pack the plugin and update the `update.json`.

### 4 Release

To build and release, use

```shell
# version increase, git add, commit and push
# then on ci, npm run build, and release to GitHub
npm run release
```

> [!note]
> This will use [Bumpp](https://github.com/antfu-collective/bumpp) to prompt for the new version number, locally bump the version, run any (pre/post)version scripts defined in `package.json`, commit, build (optional), tag the commit with the version number and push commits and git tags. Bumpp can be configured in `zotero-plugin-config.ts`; for example, add `release: { bumpp: { execute: "npm run build" } }` to also build before committing.
>
> Subsequently GitHub Action will rebuild the plugin and use `zotero-plugin-scaffold`'s `release` script to publish the XPI to GitHub Release. In addition, a separate release (tag: `release`) will be created or updated that includes update manifests `update.json` and `update-beta.json` as assets. These will be available at `https://github.com/{{owner}}/{{repo}}/releases/download/release/update*.json`.

#### About Prerelease

The template defines `prerelease` as the beta version of the plugin, when you select a `prerelease` version in Bumpp (with `-` in the version number). The build script will create a new `update-beta.json` for prerelease use, which ensures that users of the regular version won't be able to update to the beta. Only users who have manually downloaded and installed the beta will be able to update to the next beta automatically.

When the next regular release is updated, both `update.json` and `update-beta.json` will be updated (on the special `release` release, see above) so that both regular and beta users can update to the new regular release.

> [!warning]
> Strictly, distinguishing between Zotero 6 and Zotero 7 compatible plugin versions should be done by configuring `applications.zotero.strict_min_version` in `addons.__addonID__.updates[]` of `update.json` respectively, so that Zotero recognizes it properly, see <https://www.zotero.org/support/dev/zotero_7_for_developers#updaterdf_updatesjson>.
