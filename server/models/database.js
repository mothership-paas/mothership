'use strict';
const App = require('../models').App;

module.exports = (sequelize, DataTypes) => {
  const Database = sequelize.define('Database', {
    service_name: DataTypes.STRING,
    volume: DataTypes.STRING,
    app_id: {
      type: DataTypes.INTEGER,
      references: {
        model: App,
        key: 'id'
      },
    },
    network: DataTypes.STRING
  }, {});
  Database.associate = function(models) {
    // associations can be defined here
  };
  return Database;
};