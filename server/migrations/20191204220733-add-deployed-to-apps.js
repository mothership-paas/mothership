'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Apps',
      'deployed',
      Sequelize.DATE
    );
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(
      'Apps',
      'deployed',
      Sequelize.DATE
    )
  }
};
