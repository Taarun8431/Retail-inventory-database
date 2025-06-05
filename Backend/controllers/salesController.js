const db = require('../db');

const salesController = {
  // Record a new sale
  async recordSale(req, res) {
    const { branchId, productId, productName } = req.body;
    
    try {
      // Start transaction
      await db.beginTransaction();

      // Get product details
      const [product] = await db.query(
        'SELECT price, quantity FROM inventory WHERE branch_id = ? AND product_id = ?',
        [branchId, productId]
      );

      if (!product || product.length === 0) {
        await db.rollback();
        return res.status(404).json({ error: 'Product not found' });
      }

      if (product[0].quantity <= 0) {
        await db.rollback();
        return res.status(400).json({ error: 'Product is out of stock' });
      }

      const price = product[0].price;
      const totalAmount = price;

      // Record the sale
      const [saleResult] = await db.query(
        'INSERT INTO sales (branch_id, product_id, quantity, price, total_amount) VALUES (?, ?, 1, ?, ?)',
        [branchId, productId, price, totalAmount]
      );

      // Update inventory
      await db.query(
        'UPDATE inventory SET quantity = quantity - 1 WHERE branch_id = ? AND product_id = ?',
        [branchId, productId]
      );

      // Update analytics
      await updateAnalytics(branchId);

      // Commit transaction
      await db.commit();

      // Emit inventory update
      req.app.get('emitInventoryUpdate')();
      
      // Emit sales update
      req.app.get('io').emit('salesUpdated');

      res.json({
        message: 'Sale recorded successfully',
        saleId: saleResult.insertId,
        totalAmount
      });
    } catch (error) {
      await db.rollback();
      console.error('Error recording sale:', error);
      res.status(500).json({ error: 'Failed to record sale' });
    }
  },

  // Get sales summary for a branch
  async getSalesSummary(req, res) {
    const { branchId } = req.params;
    
    try {
      const today = new Date().toISOString().split('T')[0];
      
      const [summary] = await db.query(`
        SELECT 
          COUNT(*) as items_sold,
          SUM(total_amount) as total_sales,
          SUM(total_amount * 0.3) as total_profit
        FROM sales
        WHERE branch_id = ? 
        AND DATE(sale_date) = ?
      `, [branchId, today]);

      res.json({
        items_sold: summary[0].items_sold || 0,
        total_sales: summary[0].total_sales || 0,
        total_profit: summary[0].total_profit || 0
      });
    } catch (error) {
      console.error('Error getting sales summary:', error);
      res.status(500).json({ error: 'Failed to get sales summary' });
    }
  },

  // Get recent sales for a branch
  async getRecentSales(req, res) {
    const { branchId } = req.params;
    
    try {
      const [sales] = await db.query(`
        SELECT 
          s.*,
          i.product_name
        FROM sales s
        JOIN inventory i ON s.product_id = i.product_id AND s.branch_id = i.branch_id
        WHERE s.branch_id = ?
        ORDER BY s.sale_date DESC
        LIMIT 10
      `, [branchId]);

      res.json(sales);
    } catch (error) {
      console.error('Error getting recent sales:', error);
      res.status(500).json({ error: 'Failed to get recent sales' });
    }
  }
};

// Helper function to update analytics
async function updateAnalytics(branchId) {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    
    const [salesData] = await db.query(`
      SELECT 
        SUM(total_amount) as total_sales,
        SUM(total_amount * 0.3) as total_profit
      FROM sales
      WHERE branch_id = ?
      AND DATE_FORMAT(sale_date, '%Y-%m') = ?
    `, [branchId, currentMonth]);

    await db.query(`
      INSERT INTO analytics (branch_id, total_sales, total_profit, month_year)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        total_sales = VALUES(total_sales),
        total_profit = VALUES(total_profit)
    `, [
      branchId,
      salesData[0].total_sales || 0,
      salesData[0].total_profit || 0,
      currentMonth
    ]);
  } catch (error) {
    console.error('Error updating analytics:', error);
  }
}

module.exports = salesController; 