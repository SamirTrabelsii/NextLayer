-- 1. Add multiplier to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS multiplier NUMERIC DEFAULT 2.0;

-- 2. Create product_assemblies table
CREATE TABLE IF NOT EXISTS public.product_assemblies (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    parent_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    child_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure we don't add the same part twice to the same parent
    UNIQUE(parent_product_id, child_product_id)
);

-- 3. Add RLS (Row Level Security) policies
ALTER TABLE public.product_assemblies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read access" 
ON public.product_assemblies FOR SELECT
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated insert access" 
ON public.product_assemblies FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow authenticated update access" 
ON public.product_assemblies FOR UPDATE 
TO authenticated 
USING (true);

CREATE POLICY "Allow authenticated delete access" 
ON public.product_assemblies FOR DELETE 
TO authenticated 
USING (true);

-- 4. Add anon policies (since it seems you might be using anon key for reads)
CREATE POLICY "Allow anon read access" 
ON public.product_assemblies FOR SELECT 
TO anon 
USING (true);

CREATE POLICY "Allow anon insert access" 
ON public.product_assemblies FOR INSERT 
TO anon 
WITH CHECK (true);

CREATE POLICY "Allow anon update access" 
ON public.product_assemblies FOR UPDATE 
TO anon 
USING (true);

CREATE POLICY "Allow anon delete access" 
ON public.product_assemblies FOR DELETE 
TO anon 
USING (true);
