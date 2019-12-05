'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Apps',
      'envVariables',
      Sequelize.ARRAY(Sequelize.TEXT)
    );
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(
      'Apps',
      'envVariables',
      Sequelize.ARRAY(Sequelize.TEXT)
    );
  }
};
