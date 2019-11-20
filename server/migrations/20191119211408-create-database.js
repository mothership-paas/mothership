'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('Databases', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      service_name: {
        type: Sequelize.STRING
      },
      volume: {
        type: Sequelize.STRING
      },
      app_id: {
        type: Sequelize.INTEGER,
        references: {
          model: {
            tableName: 'Apps',
          },
          key: 'id'
        },
        allowNull: false
      },
      network: {
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    });
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('Databases');
  }
};