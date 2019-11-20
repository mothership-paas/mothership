'use strict';
module.exports = (sequelize, DataTypes) => {

  const Node = sequelize.define('Node', {
    name: DataTypes.STRING,
    manager: DataTypes.BOOLEAN,
    ip_address: DataTypes.STRING
  }, {});

  Node.associate = function(models) {
    // associations can be defined here
  };

  return Node;
};