import pool from '../config/database';

export interface Instrument {
  id: number;
  symbol: string;
  name: string;
  exchange: string;
  asset_type: string;
  sector?: string;
  currency: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export const createInstrumentsTable = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS instruments (
      id SERIAL PRIMARY KEY,
      symbol VARCHAR(20) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      exchange VARCHAR(50),
      asset_type VARCHAR(50) DEFAULT 'stock',
      sector VARCHAR(100),
      currency VARCHAR(10) DEFAULT 'USD',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Index for fast symbol lookup
    CREATE INDEX IF NOT EXISTS idx_instruments_symbol ON instruments(symbol);
    
    -- Index for filtering active instruments
    CREATE INDEX IF NOT EXISTS idx_instruments_active ON instruments(is_active);
  `;

  try {
    await pool.query(query);
    console.log('Instruments table created/verified');
  } catch (error) {
    console.error('Error creating instruments table:', error);
    throw error;
  }
};

 // Insert or update instrument
export const upsertInstrument = async (data: {
  symbol: string;
  name: string;
  exchange?: string;
  sector?: string;
}): Promise<Instrument> => {
  const query = `
    INSERT INTO instruments (symbol, name, exchange, sector)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (symbol) 
    DO UPDATE SET 
      name = EXCLUDED.name,
      exchange = EXCLUDED.exchange,
      sector = EXCLUDED.sector,
      updated_at = CURRENT_TIMESTAMP
    RETURNING *;
  `;

  const result = await pool.query<Instrument>(query, [
    data.symbol,
    data.name,
    data.exchange || 'UNKNOWN',
    data.sector || null,
  ]);

  return result.rows[0];
};

 // instrument by symbol
export const getInstrumentBySymbol = async (symbol: string): Promise<Instrument | null> => {
  const query = 'SELECT * FROM instruments WHERE symbol = $1 AND is_active = true';
  const result = await pool.query<Instrument>(query, [symbol.toUpperCase()]);
  return result.rows[0] || null;
};

// all active instruments
export const getAllActiveInstruments = async (): Promise<Instrument[]> => {
  const query = 'SELECT * FROM instruments WHERE is_active = true ORDER BY symbol';
  const result = await pool.query<Instrument>(query);
  return result.rows;
};