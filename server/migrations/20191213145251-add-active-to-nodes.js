'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Nodes',
      'active',
      Sequelize.BOOLEAN
    );
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(
      'Nodes',
      'active',
      Sequelize.BOOLEAN
    );
  }
};
