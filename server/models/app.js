'use strict';
const eventLogger = require('../../lib/EventLogger').eventLogger;

module.exports = (sequelize, DataTypes) => {

  const App = sequelize.define('App', {
    title: {
      type: DataTypes.STRING,
      unique: {
        args: true,
        msg: 'App title is already in use!'
      },
      validate: {
        is: {
          args: /^[a-z0-9-]+$/,
          msg: 'Title must only contain lowercase letters, numbers, or dashes.'
        },
      },
    },
    path: DataTypes.STRING,
    filename: DataTypes.STRING,
    network: DataTypes.STRING,
    url: DataTypes.STRING,
    deployed: DataTypes.DATE,
    language: DataTypes.STRING,
    languageVersion: DataTypes.STRING,
    runCommand: DataTypes.STRING,
    envVariables: {
      type: DataTypes.ARRAY(DataTypes.TEXT),
      defaultValue: [],
      allowNull: false,
    },
    replicas: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
    },
  }, {});

  App.associate = function(models) {
    App.belongsTo(models.Database, {foreignKey: 'databaseId', as: 'database'});
  };

  App.prototype.emitEvent = function(message, type) {
    if (type === 'exec') {
      eventLogger.emit(`exec-message-${this.id}`, message);
    } else {
      eventLogger.emit(`message-${this.id}`, message + '\n');
    }
  };

  App.prototype.emitStdout = function(data) {
    const message = JSON.parse(data);
    if (message.stream) {
      eventLogger.emit(`message-${this.id}`, message.stream);
    }
  };

  return App;
};
