const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const salesController = require('../controllers/salesController');

// Inventory management routes
router.post('/inventory/add', inventoryController.addToInventory);
router.delete('/inventory/remove', inventoryController.removeFromInventory);
router.get('/inventory/:branchId', inventoryController.getBranchInventory);
router.get('/inventory/total/all', inventoryController.getTotalInventory);
router.put('/inventory/update-price', inventoryController.updateProductPrice);
router.put('/inventory/update-branch-prices', inventoryController.updateBranchPrices);

// Analytics routes
router.get('/analytics', inventoryController.getAnalytics);

// Add new stock
router.post('/total/add', inventoryController.addNewStock);

// Get all products
router.get('/total/products', inventoryController.getAllProducts);

// Sales routes
router.post('/sales/record', salesController.recordSale);
router.get('/sales/summary/:branchId', salesController.getSalesSummary);
router.get('/sales/recent/:branchId', salesController.getRecentSales);

module.exports = router;