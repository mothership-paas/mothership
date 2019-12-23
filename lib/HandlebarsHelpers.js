module.exports = {
  envKey: function(str) {
    return str.split('=')[0];
  },
  envVal: function(str) {
    return str.split('=')[1];
  },
  newEnvIndex: function(envVars) {
    return envVars ? envVars.length : 0;
  },
  firstChar: function(str) {
    return (str[0] && str[0].toUpperCase()) || '';
  },
}
