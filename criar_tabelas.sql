-- Banco: mf_estoque
-- Usuário: mf_user
-- Projeto: MF Alocação de Estoque / Contagem Física

CREATE TABLE IF NOT EXISTS estoque_matriz (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    item TEXT NOT NULL,
    prateleira VARCHAR(100) DEFAULT '',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS estoque_filial (
    id SERIAL PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL UNIQUE,
    item TEXT NOT NULL,
    prateleira VARCHAR(150) DEFAULT '',
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contagem_estoque (
    id SERIAL PRIMARY KEY,
    unidade VARCHAR(20) NOT NULL CHECK (unidade IN ('matriz', 'filial')),
    codigo VARCHAR(50) NOT NULL,
    item TEXT NOT NULL,
    sistema INTEGER NOT NULL DEFAULT 0,
    contagem_fisica INTEGER DEFAULT NULL,
    diferenca INTEGER GENERATED ALWAYS AS (
        CASE
            WHEN contagem_fisica IS NULL THEN NULL
            ELSE contagem_fisica - sistema
        END
    ) STORED,
    data_contagem TIMESTAMPTZ,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (unidade, codigo)
);

CREATE INDEX IF NOT EXISTS idx_estoque_matriz_codigo
    ON estoque_matriz (codigo);

CREATE INDEX IF NOT EXISTS idx_estoque_filial_codigo
    ON estoque_filial (codigo);

CREATE INDEX IF NOT EXISTS idx_contagem_unidade_codigo
    ON contagem_estoque (unidade, codigo);

-- Trigger para atualizar "atualizado_em" quando houver alteração.
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.atualizado_em = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_estoque_matriz_update ON estoque_matriz;
CREATE TRIGGER trg_estoque_matriz_update
BEFORE UPDATE ON estoque_matriz
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_estoque_filial_update ON estoque_filial;
CREATE TRIGGER trg_estoque_filial_update
BEFORE UPDATE ON estoque_filial
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp();

DROP TRIGGER IF EXISTS trg_contagem_update ON contagem_estoque;
CREATE TRIGGER trg_contagem_update
BEFORE UPDATE ON contagem_estoque
FOR EACH ROW
EXECUTE FUNCTION atualizar_timestamp();
