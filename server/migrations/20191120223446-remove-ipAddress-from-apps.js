'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(
      'Apps',
      'ipAddress'
    )
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Apps',
      'ipAddress',
      Sequelize.STRING
    )
  }
};
