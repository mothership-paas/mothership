const request = require('supertest');
const app = require('../app');

describe('GET /', () => {
  let res;
  beforeAll(async () => {
    res = await request(app).get('/');
  })

  it('should not return an error code', () => {
    expect(res.statusCode).toBeLessThan(400);
  });

  it('should redirect to /apps', async () => {
    expect(res.statusCode).toEqual(302);
  })
});

describe('App Endpoints', () => {
  describe('GET /apps', () => {
    it('should not return an error code', async () => {
      const res = await request(app).get('/apps');

      expect(res.statusCode).toBeLessThan(400);
    });
  });
});

describe('User Endpoints', () => {
  describe('GET /users', () => {
    it('should not return an error code', async () => {
      const res = await request(app).get('/users');

      expect(res.statusCode).toBeLessThan(400);
    });
  });
});

describe('Cluster Endpoints', () => {
  describe('GET /cluster', () => {
    it('should not return an error code', async () => {
      const res = await request(app).get('/cluster');

      expect(res.statusCode).toBeLessThan(400);
    });
  });
});
