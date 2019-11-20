'use strict';
module.exports = (sequelize, DataTypes) => {

  const App = sequelize.define('App', {
    title: DataTypes.STRING,
    path: DataTypes.STRING,
    filename: DataTypes.STRING,
    network: DataTypes.STRING,
    url: DataTypes.STRING,
  }, {});

  App.associate = function(models) {
    // associations can be defined here
  };

  return App;
};
