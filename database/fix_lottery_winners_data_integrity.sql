-- Fix lottery winners data integrity issues
-- This script ensures winner names and critical data cannot be lost

-- 1. Add CHECK constraint to prevent empty strings for winner_name
ALTER TABLE lottery_winners 
DROP CONSTRAINT IF EXISTS lottery_winners_winner_name_not_empty;

ALTER TABLE lottery_winners 
ADD CONSTRAINT lottery_winners_winner_name_not_empty 
CHECK (winner_name IS NOT NULL AND LENGTH(TRIM(winner_name)) > 0);

-- 2. Add CHECK constraint to prevent empty strings for winner_contact
ALTER TABLE lottery_winners 
DROP CONSTRAINT IF EXISTS lottery_winners_winner_contact_not_empty;

ALTER TABLE lottery_winners 
ADD CONSTRAINT lottery_winners_winner_contact_not_empty 
CHECK (winner_contact IS NOT NULL AND LENGTH(TRIM(winner_contact)) > 0);

-- 3. Add CHECK constraint to prevent empty strings for prize_category
ALTER TABLE lottery_winners 
DROP CONSTRAINT IF EXISTS lottery_winners_prize_category_not_empty;

ALTER TABLE lottery_winners 
ADD CONSTRAINT lottery_winners_prize_category_not_empty 
CHECK (prize_category IS NOT NULL AND LENGTH(TRIM(prize_category)) > 0);

-- 4. Create a trigger function to prevent critical fields from being cleared
CREATE OR REPLACE FUNCTION prevent_winner_data_loss()
RETURNS TRIGGER AS $$
BEGIN
    -- Prevent winner_name from being set to NULL or empty
    IF NEW.winner_name IS NULL OR LENGTH(TRIM(NEW.winner_name)) = 0 THEN
        RAISE EXCEPTION 'winner_name cannot be NULL or empty. Original value: %', OLD.winner_name;
    END IF;
    
    -- Prevent winner_contact from being set to NULL or empty
    IF NEW.winner_contact IS NULL OR LENGTH(TRIM(NEW.winner_contact)) = 0 THEN
        RAISE EXCEPTION 'winner_contact cannot be NULL or empty. Original value: %', OLD.winner_contact;
    END IF;
    
    -- Prevent prize_category from being set to NULL or empty
    IF NEW.prize_category IS NULL OR LENGTH(TRIM(NEW.prize_category)) = 0 THEN
        RAISE EXCEPTION 'prize_category cannot be NULL or empty. Original value: %', OLD.prize_category;
    END IF;
    
    -- Prevent lottery_number from being changed
    IF NEW.lottery_number != OLD.lottery_number THEN
        RAISE EXCEPTION 'lottery_number cannot be changed. Original value: %, Attempted value: %', OLD.lottery_number, NEW.lottery_number;
    END IF;
    
    -- Trim whitespace from text fields
    NEW.winner_name = TRIM(NEW.winner_name);
    NEW.winner_contact = TRIM(NEW.winner_contact);
    NEW.prize_category = TRIM(NEW.prize_category);
    IF NEW.winner_address IS NOT NULL THEN
        NEW.winner_address = TRIM(NEW.winner_address);
    END IF;
    IF NEW.notes IS NOT NULL THEN
        NEW.notes = TRIM(NEW.notes);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS prevent_lottery_winner_data_loss ON lottery_winners;

CREATE TRIGGER prevent_lottery_winner_data_loss
BEFORE UPDATE ON lottery_winners
FOR EACH ROW
EXECUTE FUNCTION prevent_winner_data_loss();

-- 6. Create a trigger function to validate data on INSERT
CREATE OR REPLACE FUNCTION validate_winner_data_on_insert()
RETURNS TRIGGER AS $$
BEGIN
    -- Validate winner_name
    IF NEW.winner_name IS NULL OR LENGTH(TRIM(NEW.winner_name)) = 0 THEN
        RAISE EXCEPTION 'winner_name is required and cannot be empty';
    END IF;
    
    -- Validate winner_contact
    IF NEW.winner_contact IS NULL OR LENGTH(TRIM(NEW.winner_contact)) = 0 THEN
        RAISE EXCEPTION 'winner_contact is required and cannot be empty';
    END IF;
    
    -- Validate prize_category
    IF NEW.prize_category IS NULL OR LENGTH(TRIM(NEW.prize_category)) = 0 THEN
        RAISE EXCEPTION 'prize_category is required and cannot be empty';
    END IF;
    
    -- Trim whitespace from text fields
    NEW.winner_name = TRIM(NEW.winner_name);
    NEW.winner_contact = TRIM(NEW.winner_contact);
    NEW.prize_category = TRIM(NEW.prize_category);
    IF NEW.winner_address IS NOT NULL THEN
        NEW.winner_address = TRIM(NEW.winner_address);
    END IF;
    IF NEW.notes IS NOT NULL THEN
        NEW.notes = TRIM(NEW.notes);
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 7. Drop existing trigger if it exists and create new one
DROP TRIGGER IF EXISTS validate_lottery_winner_data_on_insert ON lottery_winners;

CREATE TRIGGER validate_lottery_winner_data_on_insert
BEFORE INSERT ON lottery_winners
FOR EACH ROW
EXECUTE FUNCTION validate_winner_data_on_insert();

-- 8. Add comment to document the protection
COMMENT ON TABLE lottery_winners IS 'Lottery winners table with data integrity protection. Winner names and critical fields are protected from accidental deletion or clearing.';

COMMENT ON COLUMN lottery_winners.winner_name IS 'Winner name - protected from NULL or empty values by database constraints and triggers';
COMMENT ON COLUMN lottery_winners.winner_contact IS 'Winner contact - protected from NULL or empty values by database constraints and triggers';
COMMENT ON COLUMN lottery_winners.prize_category IS 'Prize category - protected from NULL or empty values by database constraints and triggers';
COMMENT ON COLUMN lottery_winners.lottery_number IS 'Lottery number - cannot be changed after creation';

