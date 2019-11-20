'use strict';
module.exports = (sequelize, DataTypes) => {
  const Config = sequelize.define('Config', {
    key: DataTypes.STRING,
    value: DataTypes.STRING
  }, {});
  Config.associate = function(models) {
    // associations can be defined here
  };
  return Config;
};