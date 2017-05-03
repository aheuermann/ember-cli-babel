'use strict';

const co = require('co');
const expect = require('chai').expect;
const MockUI = require('console-ui/mock');
const CoreObject = require('core-object');
const AddonMixin = require('../index');
const path = require('path');
const resolve = require('resolve');
const CommonTags = require('common-tags');
const stripIndent = CommonTags.stripIndent;
const BroccoliTestHelper = require('broccoli-test-helper');
const createBuilder = BroccoliTestHelper.createBuilder;
const createTempDir = BroccoliTestHelper.createTempDir;

let Addon = CoreObject.extend(AddonMixin);

describe('ember-cli-babel', function() {
  const ORIGINAL_EMBER_ENV = process.env.EMBER_ENV;

  beforeEach(function() {
    this.ui = new MockUI();
    let project = { root: __dirname };
    this.addon = new Addon({
      project,
      parent: project,
      ui: this.ui,
    });
  });

  afterEach(function() {
    if (ORIGINAL_EMBER_ENV === undefined) {
      delete process.env.EMBER_ENV;
    } else {
      process.env.EMBER_ENV = ORIGINAL_EMBER_ENV;
    }
  });

  describe('transpileTree', function() {
    this.timeout(100000);

    let input;
    let output;
    let subject;

    beforeEach(co.wrap(function* () {
      input = yield createTempDir();
    }));

    afterEach(co.wrap(function* () {
      yield input.dispose();
      yield output.dispose();
    }));

    it("should build", co.wrap(function* () {
      input.write({
        "foo.js": `let foo = () => {};`,
        "bar.js": `let bar = () => {};`
      });

      subject = this.addon.transpileTree(input.path());
      output = createBuilder(subject);

      yield output.build();

      expect(
        output.read()
      ).to.deep.equal({
        "bar.js": `var bar = function bar() {};`,
        "foo.js": `var foo = function foo() {};`,
      });
    }));

    describe('debug macros', function() {
      it("can opt-out via ember-cli-babel.disableDebugTooling", co.wrap(function* () {
        process.env.EMBER_ENV = 'development';

        let contents = stripIndent`
          import { DEBUG } from '@glimmer/env';
          if (DEBUG) {
            console.log('debug mode!');
          }
        `;

        input.write({
          "foo.js": contents
        });

        subject = this.addon.transpileTree(input.path(), {
          'ember-cli-babel': {
            disableDebugTooling: true
          }
        });

        output = createBuilder(subject);

        yield output.build();

        expect(
          output.read()
        ).to.deep.equal({
          "foo.js": contents
        });
      }));

      describe('in development', function() {
        it("should replace env flags by default ", co.wrap(function* () {
          process.env.EMBER_ENV = 'development';

          input.write({
            "foo.js": stripIndent`
              import { DEBUG } from '@glimmer/env';
              if (DEBUG) { console.log('debug mode!'); }
            `
          });

          subject = this.addon.transpileTree(input.path());
          output = createBuilder(subject);

          yield output.build();

          expect(
            output.read()
          ).to.deep.equal({
            "foo.js": `\nif (true) {\n  console.log('debug mode!');\n}`
          });
        }));

        it("should replace debug macros by default ", co.wrap(function* () {
          process.env.EMBER_ENV = 'development';

          input.write({
            "foo.js": stripIndent`
              import { assert } from '@ember/debug';
              assert('stuff here', isNotBad());
            `
          });

          subject = this.addon.transpileTree(input.path());
          output = createBuilder(subject);

          yield output.build();

          expect(
            output.read()
          ).to.deep.equal({
            "foo.js": `(true && Ember.assert('stuff here', isNotBad()));`
          });
        }));
      });

      describe('in production', function() {
        it("should replace env flags by default ", co.wrap(function* () {
          process.env.EMBER_ENV = 'production';

          input.write({
            "foo.js": stripIndent`
              import { DEBUG } from '@glimmer/env';
              if (DEBUG) { console.log('debug mode!'); }
            `
          });

          subject = this.addon.transpileTree(input.path());
          output = createBuilder(subject);

          yield output.build();

          expect(
            output.read()
          ).to.deep.equal({
            "foo.js": `\nif (false) {\n  console.log('debug mode!');\n}`
          });
        }));

        it("should replace debug macros by default ", co.wrap(function* () {
          process.env.EMBER_ENV = 'production';

          input.write({
            "foo.js": stripIndent`
              import { assert } from '@ember/debug';
              assert('stuff here', isNotBad());
            `
          });

          subject = this.addon.transpileTree(input.path());
          output = createBuilder(subject);

          yield output.build();

          expect(
            output.read()
          ).to.deep.equal({
            "foo.js": `(false && Ember.assert('stuff here', isNotBad()));`
          });
        }));
      });
    });
  });

  describe('_getAddonOptions', function() {
    it('uses parent options if present', function() {
      let mockOptions = this.addon.parent.options = {};

      expect(this.addon._getAddonOptions()).to.be.equal(mockOptions);
    });

    it('uses app options if present', function() {
      let mockOptions = {};
      this.addon.app = { options: mockOptions };

      expect(this.addon._getAddonOptions()).to.be.equal(mockOptions);
    });

    it('parent options win over app options', function() {
      let mockParentOptions = this.addon.parent.options = {};
      let mockAppOptions = {};
      this.addon.app = { options: mockAppOptions };

      expect(this.addon._getAddonOptions()).to.be.equal(mockParentOptions);
    });
  });

  describe('_shouldIncludePolyfill()', function() {
    describe('without any includePolyfill option set', function() {
      it('should return false', function() {
        expect(this.addon._shouldIncludePolyfill()).to.be.false;
      });

      it('should not print deprecation messages', function() {
        this.addon._shouldIncludePolyfill();

        let deprecationMessages = this.ui.output.split('\n').filter(function(line) {
          return line.indexOf('Putting the "includePolyfill" option in "babel" is deprecated') !== -1;
        });

        expect(deprecationMessages).to.have.lengthOf(0);
      });
    });

    describe('with ember-cli-babel.includePolyfill = true', function() {
      beforeEach(function() {
        this.addon.parent.options = { 'ember-cli-babel': { includePolyfill: true } };
      });

      it('should return true', function() {
        expect(this.addon._shouldIncludePolyfill()).to.be.true;
      });

      it('should not print deprecation messages', function() {
        this.addon._shouldIncludePolyfill();

        let deprecationMessages = this.ui.output.split('\n').filter(function(line) {
          return line.indexOf('Putting the "includePolyfill" option in "babel" is deprecated') !== -1;
        });

        expect(deprecationMessages).to.have.lengthOf(0);
      });
    });

    describe('with ember-cli-babel.includePolyfill = false', function() {
      beforeEach(function() {
        this.addon.parent.options = { 'ember-cli-babel': { includePolyfill: false } };
      });

      it('should return false', function() {
        expect(this.addon._shouldIncludePolyfill()).to.be.false;
      });

      it('should not print deprecation messages', function() {
        this.addon._shouldIncludePolyfill();

        let deprecationMessages = this.ui.output.split('\n').filter(function(line) {
          return line.indexOf('Putting the "includePolyfill" option in "babel" is deprecated') !== -1;
        });

        expect(deprecationMessages).to.have.lengthOf(0);
      });
    });
  });

  describe('_shouldCompileModules()', function() {
    beforeEach(function() {
      this.addon.parent = {
        options: {}
      };
    });

    describe('without any compileModules option set', function() {
      it('returns false for ember-cli < 2.12', function() {
        this.addon.emberCLIChecker = { gt() { return false; } };

        expect(this.addon.shouldCompileModules()).to.eql(false);
      });

      it('returns true for ember-cli > 2.12.0-alpha.1', function() {
        this.addon.emberCLIChecker = { gt() { return true; } };

        expect(this.addon.shouldCompileModules()).to.be.true;
      });

      it('does not print deprecation messages', function() {
        this.addon.shouldCompileModules();

        let deprecationMessages = this.ui.output.split('\n').filter(function(line) {
          return line.indexOf('Putting the "compileModules" option in "babel" is deprecated') !== -1;
        });

        expect(deprecationMessages).to.have.lengthOf(0);
      });
    });

    describe('with ember-cli-babel.compileModules = true', function() {
      it('should return true', function() {
        expect(this.addon._shouldCompileModules({
          'ember-cli-babel': { compileModules: true }
        })).to.eql(true);
      });

      it('should not print deprecation messages', function() {
        this.addon._shouldCompileModules({
          'ember-cli-babel': { compileModules: true }
        });

        let deprecationMessages = this.ui.output.split('\n').filter(function(line) {
          return line.indexOf('Putting the "compileModules" option in "babel" is deprecated') !== -1;
        });

        expect(deprecationMessages).to.have.lengthOf(0);
      });
    });

    describe('with ember-cli-babel.compileModules = false', function() {
      beforeEach(function() {
        this.addon.parent = {
          options: {
            'ember-cli-babel': { compileModules: false }
          }
        };
      });

      it('should return false', function() {
        expect(this.addon.shouldCompileModules()).to.be.false;
      });

      it('should not print deprecation messages', function() {
        this.addon.shouldCompileModules();

        let deprecationMessages = this.ui.output.split('\n').filter(function(line) {
          return line.indexOf('Putting the "compileModules" option in "babel" is deprecated') !== -1;
        });

        expect(deprecationMessages).to.have.lengthOf(0);
      });
    });
  });

  describe('_getAddonProvidedConfig', function() {
    it('does not mutate addonOptions.babel', function() {
      let babelOptions = { blah: true };
      this.addon.parent = {
        options: {
          babel: babelOptions,
        },
      };

      let result = this.addon._getAddonProvidedConfig(this.addon._getAddonOptions());
      expect(result.options).to.not.equal(babelOptions);
    });

    it('includes options specified in parent.options.babel6', function() {
      this.addon.parent = {
        options: {
          babel6: {
            loose: true
          },
        },
      };

      let result = this.addon._getAddonProvidedConfig(this.addon._getAddonOptions());
      expect(result.options.loose).to.be.true;
    });
  });

  describe('buildBabelOptions', function() {
    this.timeout(20000);

    it('disables reading `.babelrc`', function() {
      let options = {};

      let result = this.addon.buildBabelOptions(options);

      expect(result.babelrc).to.be.false;
    });

    it('does not include all provided options', function() {
      let babelOptions = { blah: true };
      let options = {
        babel: babelOptions
      };

      let result = this.addon.buildBabelOptions(options);
      expect(result.blah).to.be.undefined;
    });

    it('does not include all provided options', function() {
      let babelOptions = { blah: true };
      this.addon.parent = {
        options: {
          babel: babelOptions,
        },
      };

      let result = this.addon.buildBabelOptions();
      expect(result.blah).to.be.undefined;
    });

    it('includes user plugins in parent.options.babel.plugins', function() {
      let plugin = {};
      this.addon.parent = {
        options: {
          babel: {
            plugins: [ plugin ]
          },
        },
      };

      let result = this.addon.buildBabelOptions();
      expect(result.plugins).to.include(plugin);
    });

    it('includes postTransformPlugins after preset-env plugins', function() {
      let plugin = {};
      let pluginAfter = {};
      this.addon.parent = {
        options: {
          babel: {
            plugins: [ plugin ],
            postTransformPlugins: [ pluginAfter ]
          },
        },
      };

      let result = this.addon.buildBabelOptions();

      expect(result.plugins).to.include(plugin);
      expect(result.plugins.slice(-1)).to.deep.equal([pluginAfter]);
      expect(result.postTransformPlugins).to.be.undefined;
    });

    it('includes user plugins in parent.options.babel6.plugins', function() {
      let plugin = {};
      this.addon.parent = {
        options: {
          babel6: {
            plugins: [ plugin ]
          },
        },
      };

      let result = this.addon.buildBabelOptions();
      expect(result.plugins).to.include(plugin);
    });

    it('user plugins are before preset-env plugins', function() {
      let plugin = function Plugin() {};
      this.addon.parent = {
        options: {
          babel: {
            plugins: [ plugin ]
          },
        },
      };

      let result = this.addon.buildBabelOptions();
      expect(result.plugins[0]).to.equal(plugin);
    });

    it('includes resolveModuleSource if compiling modules', function() {
      this.addon._shouldCompileModules = () => true;

      let result = this.addon.buildBabelOptions();
      expect(result.resolveModuleSource).to.equal(require('amd-name-resolver').moduleResolve);
    });

    it('does not include resolveModuleSource when not compiling modules', function() {
      this.addon._shouldCompileModules = () => false;

      let result = this.addon.buildBabelOptions();
      expect(result.resolveModuleSource).to.equal(undefined);
    });
  });

  describe('_getPresetEnvPlugins', function() {
    function includesPlugin(haystack, needleName) {
      let presetEnvBaseDir = path.dirname(require.resolve('babel-preset-env'));
      let pluginPath = resolve.sync(needleName, { basedir: presetEnvBaseDir });
      let NeedleModule = require(pluginPath);
      let Needle = NeedleModule.__esModule ? NeedleModule.default : NeedleModule;

      for (let i = 0; i < haystack.length; i++) {
        let PluginModule = haystack[i][0];
        let Plugin = PluginModule.__esModule ? PluginModule.default : PluginModule;

        if (Plugin === Needle) {
          return true;
        }
      }

      return false;
    }

    it('passes options.babel through to preset-env', function() {
      let babelOptions = { loose: true };
      this.addon.parent = {
        options: {
          babel: babelOptions,
        },
      };

      let invokingOptions;
      this.addon._presetEnv = function(context, options) {
        invokingOptions = options;
        return { plugins: [] };
      };

      this.addon.buildBabelOptions();

      expect(invokingOptions.loose).to.be.true;
    });

    it('passes options.babel6 through to preset-env', function() {
      let babelOptions = { loose: true };
      this.addon.parent = {
        options: {
          babel6: babelOptions,
        },
      };

      let invokingOptions;
      this.addon._presetEnv = function(context, options) {
        invokingOptions = options;
        return { plugins: [] };
      };

      this.addon.buildBabelOptions();

      expect(invokingOptions.loose).to.be.true;
    });

    it('includes class transform when targets require plugin', function() {
      this.addon.project.targets = {
        browsers: ['ie 9']
      };

      let plugins = this.addon.buildBabelOptions().plugins;
      let found = includesPlugin(plugins, 'babel-plugin-transform-es2015-classes');

      expect(found).to.be.true;
    });

    it('returns false when targets do not require plugin', function() {
      this.addon.project.targets = {
        browsers: ['last 2 chrome versions']
      };

      let plugins = this.addon.buildBabelOptions().plugins;
      let found = includesPlugin(plugins, 'babel-plugin-transform-es2015-classes');

      expect(found).to.be.false;
    });
  });

  describe('isPluginRequired', function() {
    it('returns true when no targets are specified', function() {
      this.addon.project.targets = null;

      let pluginRequired = this.addon.isPluginRequired('transform-regenerator');
      expect(pluginRequired).to.be.true;
    });

    it('returns true when targets require plugin', function() {
      this.addon.project.targets = {
        browsers: ['ie 9']
      };

      let pluginRequired = this.addon.isPluginRequired('transform-regenerator');
      expect(pluginRequired).to.be.true;
    });

    it('returns false when targets do not require plugin', function() {
      this.addon.project.targets = {
        browsers: ['last 2 chrome versions']
      };

      let pluginRequired = this.addon.isPluginRequired('transform-regenerator');
      expect(pluginRequired).to.be.false;
    });
  });
});
