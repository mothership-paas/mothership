module.exports = {
  envKey: function(str) {
    return str.split('=')[0];
  },
  envVal: function(str) {
    return str.split('=')[1];
  },
}