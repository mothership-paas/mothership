'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(
      'Apps',
      'dropletName',
    )
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Apps',
      'dropletName',
      Sequelize.STRING
    )
  }
};
