'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Users',
      'tokens',
      Sequelize.ARRAY(Sequelize.TEXT)
    );
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(
      'Users',
      'tokens',
    );
  }
};
