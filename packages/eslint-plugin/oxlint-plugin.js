const plugin = require('./dist/index.js');

module.exports = {
  meta: { name: '@typedcss' },
  ...plugin,
};
