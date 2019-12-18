'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.bulkInsert('Nodes', [
      {
        name: process.env.MOTHERSHIP_MANAGER_NAME,
        ip_address: process.env.MOTHERSHIP_MANAGER_IP,
        manager: true,
        createdAt: Sequelize.literal('NOW()'),
        updatedAt: Sequelize.literal('NOW()'),
        active: true,
      }
    ]).then(() => {
      return queryInterface.bulkInsert('Configs', [
        {
          key: 'domain',
          value: process.env.MOTHERSHIP_DOMAIN,
          createdAt: Sequelize.literal('NOW()'),
          updatedAt: Sequelize.literal('NOW()'),
        },
        {
          key: 'proxyNetwork',
          value: 'proxy',
          createdAt: Sequelize.literal('NOW()'),
          updatedAt: Sequelize.literal('NOW()'),
        }
      ]);
    }).then(() => {
      return queryInterface.bulkInsert('Users', [
        {
          firstName: 'Mothership',
          lastName: 'Admin',
          username: 'admin@mothership.live',
          password: '$2b$10$BeiAfxaYgQaLqUv.2.m2SOeofioPfGhipYOYnQJubBJ.ccHW/g.Zi',
          createdAt: Sequelize.literal('NOW()'),
          updatedAt: Sequelize.literal('NOW()'),
          role: 'admin',
        }
      ])
    });
  },

  down: (queryInterface, Sequelize) => {
    return queryInterface.bulkDelete('Nodes', null, {}).then(() => {
      return queryInterface.bulkDelete('Configs', null, {}).then(() => {
        return queryInterface.bulkDelete('Users', null, {});
      });
    });
  },
}
