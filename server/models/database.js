'use strict';
const App = require('../models').App;

module.exports = (sequelize, DataTypes) => {
  const Database = sequelize.define('Database', {
    service_name: DataTypes.STRING,
    volume: DataTypes.STRING,
    network: DataTypes.STRING
  }, {});

  Database.associate = function(models) {
    Database.hasOne(models.App, {foreignKey: 'databaseId', as: 'app'});
  };

  return Database;
};
