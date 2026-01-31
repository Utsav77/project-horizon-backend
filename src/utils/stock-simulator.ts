/**
 * Geometric Brownian Motion (GBM)
 * GBM is the industry-standard model for simulating stock prices.
 * Used in:
 * - Black-Scholes option pricing
 * - Monte Carlo risk simulations  
 * - Algorithmic trading backtests
 * - Demo/paper trading modes
 * Formula: dS = μ*S*dt + σ*S*dW
 * Where:
 * - S: current stock price
 * - μ: drift (expected return, annualized)
 * - σ: volatility (standard deviation, annualized)
 * - dt: time step (fraction of year)
 * - dW: random normal shock ~ N(0, 1)
 */

class StockSimulator {
    /**
     * Generate next price using GBM
     * 
     * @param currentPrice - Current stock price
     * @param drift - Annual expected return (e.g., 0.10 for 10%)
     * @param volatility - Annual volatility (e.g., 0.30 for 30%)
     * @param timeStep - Time interval in years (e.g., 1/252 for 1 day)
     */
    generateNextPrice(
      currentPrice: number,
      drift: number = 0.10,
      volatility: number = 0.30,
      timeStep: number = 1 / (252 * 78) // ~1 minute (252 days, 6.5 hours, 60 min)
    ): number {
      // Generate random normal variable (Box-Muller transform)
      const randomShock = this.randomNormal(0, 1);
  
      // GBM formula
      const drift_component = drift * timeStep;
      const volatility_component = volatility * Math.sqrt(timeStep) * randomShock;
  
      // Next price
      const nextPrice = currentPrice * Math.exp(drift_component + volatility_component);
  
      return parseFloat(nextPrice.toFixed(2));
    }
  
    /**
     * Generate random number from normal distribution N(mean, stdDev)
     * Uses Box-Muller transform
     * Math.random() gives uniform distribution [0,1]
     * Box-Muller converts uniform → normal distribution
     * This is how all quant libraries generate random walks
     */
    private randomNormal(mean: number = 0, stdDev: number = 1): number {
      // Box-Muller transform
      const u1 = Math.random();
      const u2 = Math.random();
      const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return z0 * stdDev + mean;
    }
  
    /**
     * Generate price path over time
     * Useful for charts and historical data simulation
     * 
     * @param startPrice - Initial price
     * @param steps - Number of time steps
     * @param drift - Annual return
     * @param volatility - Annual volatility
     * @param timeStep - Time interval per step
     */
    generatePricePath(
      startPrice: number,
      steps: number,
      drift: number = 0.10,
      volatility: number = 0.30,
      timeStep: number = 1 / 252 // Daily by default
    ): number[] {
      const prices: number[] = [startPrice];
  
      for (let i = 1; i < steps; i++) {
        const nextPrice = this.generateNextPrice(prices[i - 1], drift, volatility, timeStep);
        prices.push(nextPrice);
      }
      return prices;
    }
  
    /**
     * Calculate realistic volatility based on sector
     * Different sectors have different typical volatilities:
     * - Tech stocks: High volatility (30-50%)
     * - Utilities: Low volatility (10-20%)
     * - Financial: Medium volatility (20-30%)
     */
    getSectorVolatility(sector?: string): number {
      const volatilities: Record<string, number> = {
        technology: 0.40,
        healthcare: 0.35,
        financial: 0.25,
        energy: 0.35,
        utilities: 0.15,
        consumer: 0.25,
        industrial: 0.25,
      };
      return volatilities[sector?.toLowerCase() || ''] || 0.30;
    }
  
    /**
     * Get symbol-specific parameters for realistic simulation
     */
    getSymbolParameters(symbol: string): { drift: number; volatility: number; basePrice: number } {
      // Real stocks have different characteristics
      const params: Record<string, { drift: number; volatility: number; basePrice: number }> = {
        // High-growth tech (high volatility, high return)
        TSLA: { drift: 0.15, volatility: 0.60, basePrice: 250 },
        NVDA: { drift: 0.20, volatility: 0.50, basePrice: 880 },
        
        // Mega-cap tech (moderate volatility, solid return)
        AAPL: { drift: 0.12, volatility: 0.30, basePrice: 180 },
        MSFT: { drift: 0.12, volatility: 0.28, basePrice: 380 },
        GOOGL: { drift: 0.10, volatility: 0.30, basePrice: 140 },
        AMZN: { drift: 0.12, volatility: 0.35, basePrice: 170 },
        META: { drift: 0.10, volatility: 0.40, basePrice: 480 },
        
        // Blue-chip stable (low volatility, modest return)
        JNJ: { drift: 0.06, volatility: 0.15, basePrice: 160 },
        PG: { drift: 0.05, volatility: 0.15, basePrice: 150 },
        KO: { drift: 0.05, volatility: 0.18, basePrice: 60 },
        
        // Financial (moderate everything)
        JPM: { drift: 0.08, volatility: 0.25, basePrice: 190 },
        BAC: { drift: 0.07, volatility: 0.28, basePrice: 35 },
      };
  
      return params[symbol.toUpperCase()] || { drift: 0.10, volatility: 0.30, basePrice: 100 };
    }
  }
  
  export default new StockSimulator();