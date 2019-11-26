'use strict';

module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.addColumn(
      'Apps',
      'databaseId',
      {
        type: Sequelize.INTEGER,
        references: {
          model: {
            tableName: 'Databases',
          },
          key: 'id'
        }
      }
    )
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.removeColumn(
      'Apps',
      'databaseId'
    )
  }
};
