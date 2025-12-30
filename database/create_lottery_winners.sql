-- Create lottery_winners table for managing lottery prize winners
CREATE TABLE IF NOT EXISTS lottery_winners (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    lottery_number INTEGER NOT NULL UNIQUE,
    ticket_sale_id UUID REFERENCES ticket_sales(id) ON DELETE SET NULL,
    prize_category VARCHAR(255) NOT NULL,
    prize_quantity INTEGER NOT NULL,
    winner_name VARCHAR(255) NOT NULL,
    winner_contact VARCHAR(20) NOT NULL,
    winner_address TEXT,
    diary_number INTEGER,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    registered_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on lottery_number for fast lookups
CREATE INDEX IF NOT EXISTS idx_lottery_winners_lottery_number ON lottery_winners(lottery_number);

-- Create index on prize_category for filtering
CREATE INDEX IF NOT EXISTS idx_lottery_winners_prize_category ON lottery_winners(prize_category);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_lottery_winners_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_lottery_winners_updated_at 
BEFORE UPDATE ON lottery_winners 
FOR EACH ROW 
EXECUTE FUNCTION update_lottery_winners_updated_at();

-- Create view to get prize category statistics
CREATE OR REPLACE VIEW prize_category_stats AS
SELECT 
    prize_category,
    COUNT(*) as winners_count,
    MAX(prize_quantity) as total_quantity,
    MAX(prize_quantity) - COUNT(*) as remaining_quantity
FROM lottery_winners
GROUP BY prize_category;

-- Insert prize categories with quantities (for reference)
-- This can be used to validate quantities
CREATE TABLE IF NOT EXISTS prize_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    category_name VARCHAR(255) NOT NULL UNIQUE,
    total_quantity INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert prize categories
INSERT INTO prize_categories (category_name, total_quantity) VALUES
('THAR CAR', 1),
('SWIFT CAR', 1),
('E-Rickshaw', 1),
('Bullet Bike', 1),
('HF delux Bike', 5),
('Electric Bike', 3),
('AC 1Ton', 1),
('Laptop', 3),
('32 Inch LED TV', 5),
('Fridge', 5),
('Washing Machine', 5),
('Sewing Machine', 5),
('Sports Cycle', 5),
('5G Mobile', 11),
('Cooler', 11),
('Child EV Bike', 10),
('Home Theater', 5),
('Electric Water Heater', 5),
('Battery Spray Pump', 27),
('Mixer', 10),
('Induction stove', 10),
('Ceiling Fan', 10),
('Smart Watch', 11),
('Gas Stove', 27),
('Helmet', 54),
('Silver Coin', 54),
('Wall Clock', 108),
('Photo Frame', 108)
ON CONFLICT (category_name) DO NOTHING;

