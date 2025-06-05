const db = require('../db');

const inventoryController = {
  // Add product to inventory
  async addToInventory(req, res) {
    try {
      const { branchId, productId, productName } = req.body;
      
      // Get price from product data
      const prices = {
        'HS001': 199, // Herbal Shampoo
        'RB001': 800, // Rice Bag
        'WP001': 150, // Washing Powder
        'CO001': 250  // Cooking Oil
      };
      
      const price = prices[productId] || 0;
      
      console.log('Adding to inventory:', { branchId, productId, productName, price });
      
      // First check if the product exists
      const checkQuery = 'SELECT quantity, price FROM inventory WHERE branch_id = ? AND product_id = ?';
      const [existingRows] = await db.execute(checkQuery, [branchId, productId]);
      
      if (existingRows.length > 0) {
        // Update existing product
        const updateQuery = `
          UPDATE inventory 
          SET quantity = quantity + 1,
              price = ?
          WHERE branch_id = ? AND product_id = ?
        `;
        await db.execute(updateQuery, [price, branchId, productId]);
      } else {
        // Insert new product
        const insertQuery = `
          INSERT INTO inventory (branch_id, product_id, product_name, quantity, price)
          VALUES (?, ?, ?, 1, ?)
        `;
        await db.execute(insertQuery, [branchId, productId, productName, price]);
      }
      
      // Update analytics
      await updateAnalytics(branchId);
      
      // Emit inventory update event
      req.app.get('emitInventoryUpdate')();
      
      res.json({ message: 'Product added to inventory successfully' });
    } catch (error) {
      console.error('Error adding to inventory:', error);
      res.status(500).json({ error: 'Failed to add to inventory: ' + error.message });
    }
  },

  // Remove product from inventory
  async removeFromInventory(req, res) {
    try {
      const { branchId, productId, productName } = req.body;
      
      // First check if the product exists
      const checkQuery = 'SELECT quantity, price FROM inventory WHERE branch_id = ? AND product_id = ?';
      const [rows] = await db.execute(checkQuery, [branchId, productId]);
      
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Product not found in inventory' });
      }
      
      if (rows[0].quantity <= 0) {
        return res.status(400).json({ error: 'Product is out of stock' });
      }
      
      const query = `
        UPDATE inventory 
        SET quantity = quantity - 1
        WHERE branch_id = ? AND product_id = ?
      `;
      
      const [result] = await db.execute(query, [branchId, productId]);
      
      // Update analytics
      await updateAnalytics(branchId);
      
      // Emit inventory update event
      req.app.get('emitInventoryUpdate')();
      
      res.json({ message: 'Product removed from inventory successfully' });
    } catch (error) {
      console.error('Error removing from inventory:', error);
      res.status(500).json({ error: 'Failed to remove from inventory: ' + error.message });
    }
  },

  // Get inventory for a specific branch
  async getBranchInventory(req, res) {
    try {
      const { branchId } = req.params;
      
      const query = 'SELECT * FROM inventory WHERE branch_id = ?';
      const [rows] = await db.execute(query, [branchId]);
      
      res.json(rows);
    } catch (error) {
      console.error('Error fetching branch inventory:', error);
      res.status(500).json({ error: 'Failed to fetch branch inventory: ' + error.message });
    }
  },

  // Get total inventory across all branches
  async getTotalInventory(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT 
          i.product_id,
          i.product_name,
          i.branch_id,
          i.quantity
        FROM inventory i
        ORDER BY i.product_id, i.branch_id
      `);

      // Group the results by product
      const groupedData = rows.reduce((acc, row) => {
        const existingProduct = acc.find(p => p.product_id === row.product_id);
        
        if (existingProduct) {
          existingProduct.branch_quantities.push({
            branch_id: row.branch_id,
            quantity: row.quantity
          });
        } else {
          acc.push({
            product_id: row.product_id,
            product_name: row.product_name,
            branch_quantities: [{
              branch_id: row.branch_id,
              quantity: row.quantity
            }]
          });
        }
        
        return acc;
      }, []);

      res.json(groupedData);
    } catch (error) {
      console.error('Error in getTotalInventory:', error);
      res.status(500).json({ error: 'Failed to fetch total inventory', details: error.message });
    }
  },

  // Get analytics data
  async getAnalytics(req, res) {
    try {
      const [rows] = await db.query(`
        SELECT 
          branch_id,
          SUM(total_sales) as total_sales,
          SUM(total_profit) as total_profit,
          SUM(total_loss) as total_loss,
          month_year
        FROM analytics
        GROUP BY branch_id, month_year
        ORDER BY month_year DESC
        LIMIT 12
      `);
      res.json(rows);
    } catch (error) {
      console.error('Error in getAnalytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics data' });
    }
  },

  // Add new stock to total inventory
  async addNewStock(req, res) {
    const { product_name, price } = req.body;
    
    try {
      // Validate input
      if (!product_name || !price) {
        return res.status(400).json({ error: 'Product name and price are required' });
      }

      if (isNaN(price) || price <= 0) {
        return res.status(400).json({ error: 'Price must be a positive number' });
      }

      // First add to total_inventory
      const [result] = await db.query(
        'INSERT INTO total_inventory (product_name, price) VALUES (?, ?)',
        [product_name, price]
      );

      // Then add to each branch's inventory with 0 quantity
      const branches = ['branch1', 'branch2', 'branch3'];
      for (const branch of branches) {
        await db.query(
          'INSERT INTO inventory (branch_id, product_id, product_name, quantity, price) VALUES (?, ?, ?, ?, ?)',
          [branch, result.insertId.toString(), product_name, 0, price]
        );
      }

      // Emit inventory update event
      req.app.get('emitInventoryUpdate')();

      res.status(201).json({ message: 'Stock added successfully', product_id: result.insertId });
    } catch (error) {
      console.error('Error adding new stock:', error);
      res.status(500).json({ 
        error: 'Failed to add new stock',
        details: error.message,
        code: error.code
      });
    }
  },

  // Get all products from total inventory
  async getAllProducts(req, res) {
    try {
      const [products] = await db.query('SELECT * FROM total_inventory ORDER BY product_name');
      res.json(products);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ error: 'Failed to fetch products' });
    }
  },

  // Update product price across all branches
  async updateProductPrice(req, res) {
    const { productId, newPrice } = req.body;
    
    try {
      // Validate input
      if (!productId || !newPrice) {
        return res.status(400).json({ error: 'Product ID and new price are required' });
      }

      if (isNaN(newPrice) || newPrice <= 0) {
        return res.status(400).json({ error: 'Price must be a positive number' });
      }

      // Update price in total_inventory
      await db.query(
        'UPDATE total_inventory SET price = ? WHERE product_id = ?',
        [newPrice, productId]
      );

      // Update price in all branches
      const branches = ['branch1', 'branch2', 'branch3'];
      for (const branch of branches) {
        await db.query(
          'UPDATE inventory SET price = ? WHERE branch_id = ? AND product_id = ?',
          [newPrice, branch, productId]
        );
      }

      // Emit inventory update event
      req.app.get('emitInventoryUpdate')();

      res.json({ message: 'Product price updated successfully across all branches' });
    } catch (error) {
      console.error('Error updating product price:', error);
      res.status(500).json({ 
        error: 'Failed to update product price',
        details: error.message
      });
    }
  },

  // Update product price for specific branches
  async updateBranchPrices(req, res) {
    const { productId, newPrice, branches } = req.body;
    
    try {
      // Validate input
      if (!productId || !newPrice || !branches || !Array.isArray(branches)) {
        return res.status(400).json({ error: 'Product ID, new price, and branches array are required' });
      }

      if (isNaN(newPrice) || newPrice <= 0) {
        return res.status(400).json({ error: 'Price must be a positive number' });
      }

      // Update price in total_inventory
      await db.query(
        'UPDATE total_inventory SET price = ? WHERE product_id = ?',
        [newPrice, productId]
      );

      // Update price in specified branches
      for (const branch of branches) {
        await db.query(
          'UPDATE inventory SET price = ? WHERE branch_id = ? AND product_id = ?',
          [newPrice, branch, productId]
        );
      }

      // Emit inventory update event
      req.app.get('emitInventoryUpdate')();

      res.json({ message: 'Product price updated successfully for specified branches' });
    } catch (error) {
      console.error('Error updating branch prices:', error);
      res.status(500).json({ 
        error: 'Failed to update branch prices',
        details: error.message
      });
    }
  }
};

// Helper function to update analytics
async function updateAnalytics(branchId) {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    console.log('Updating analytics for branch:', branchId, 'month:', currentMonth);
    
    // Calculate sales, profit, and loss for the branch
    const query = `
      INSERT INTO analytics (branch_id, total_sales, total_profit, total_loss, month_year)
      SELECT 
        branch_id,
        SUM(quantity * price) as total_sales,
        SUM(quantity * (price * 0.3)) as total_profit,
        SUM(CASE WHEN quantity = 0 THEN price * 0.1 ELSE 0 END) as total_loss,
        ?
      FROM inventory
      WHERE branch_id = ?
      GROUP BY branch_id
      ON DUPLICATE KEY UPDATE
        total_sales = VALUES(total_sales),
        total_profit = VALUES(total_profit),
        total_loss = VALUES(total_loss)
    `;
    
    const [result] = await db.execute(query, [currentMonth, branchId]);
    console.log('Analytics update result:', result);
  } catch (error) {
    console.error('Error updating analytics:', error);
  }
}

module.exports = inventoryController;
