-- Add password reset columns to users table if they don't exist
DO $$
BEGIN
    -- Add reset_password_token column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'users' 
                  AND column_name = 'reset_password_token') THEN
        ALTER TABLE users ADD COLUMN reset_password_token VARCHAR(255);
        RAISE NOTICE 'Added column reset_password_token to users table';
    ELSE
        RAISE NOTICE 'Column reset_password_token already exists in users table';
    END IF;

    -- Add reset_password_expires column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'users' 
                  AND column_name = 'reset_password_expires') THEN
        ALTER TABLE users ADD COLUMN reset_password_expires TIMESTAMP WITH TIME ZONE;
        RAISE NOTICE 'Added column reset_password_expires to users table';
    ELSE
        RAISE NOTICE 'Column reset_password_expires already exists in users table';
    END IF;

    -- Add reset_password_used column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_schema = 'public' 
                  AND table_name = 'users' 
                  AND column_name = 'reset_password_used') THEN
        ALTER TABLE users ADD COLUMN reset_password_used BOOLEAN DEFAULT FALSE NOT NULL;
        RAISE NOTICE 'Added column reset_password_used to users table';
    ELSE
        RAISE NOTICE 'Column reset_password_used already exists in users table';
    END IF;
END $$;

-- Create an index for the reset token if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_indexes 
        WHERE indexname = 'idx_users_reset_token'
    ) THEN
        CREATE INDEX idx_users_reset_token ON users(reset_password_token);
        RAISE NOTICE 'Created index idx_users_reset_token on users table';
    ELSE
        RAISE NOTICE 'Index idx_users_reset_token already exists on users table';
    END IF;
END $$;

-- Create or replace the trigger function to update the updated_at column
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_trigger 
        WHERE tgname = 'update_users_updated_at'
    ) THEN
        CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_modified_column();
        RAISE NOTICE 'Created trigger update_users_updated_at on users table';
    ELSE
        RAISE NOTICE 'Trigger update_users_updated_at already exists on users table';
    END IF;
END $$;

-- Add comments for the new columns
COMMENT ON COLUMN users.reset_password_token IS 'Token para restablecer la contraseña';
COMMENT ON COLUMN users.reset_password_expires IS 'Fecha de expiración del token de restablecimiento';
COMMENT ON COLUMN users.reset_password_used IS 'Indica si el token ha sido utilizado';

-- Output completion message
DO $$
BEGIN
    RAISE NOTICE 'Database migration completed successfully';
END $$;
