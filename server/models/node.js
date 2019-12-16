'use strict';
module.exports = (sequelize, DataTypes) => {

  const Node = sequelize.define('Node', {
    name: DataTypes.STRING,
    manager: DataTypes.BOOLEAN,
    ip_address: DataTypes.STRING,
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
  }, {});

  Node.associate = function(models) {
    // associations can be defined here
  };

  return Node;
};
