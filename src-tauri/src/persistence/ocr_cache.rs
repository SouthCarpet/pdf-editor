use anyhow::Result;
use sqlx::{Row, SqlitePool};

pub const OCR_CACHE_MAX_ROWS: i64 = 2_500;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OcrCacheKey {
    pub file_sha256: String,
    pub page_index: u32,
    pub dpi: u32,
    pub language: String,
    pub engine: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CachedOcrPage {
    pub hocr: String,
    pub pixel_width: u32,
    pub pixel_height: u32,
}

pub async fn get(pool: &SqlitePool, key: &OcrCacheKey) -> Result<Option<CachedOcrPage>> {
    let now = chrono::Utc::now().timestamp_millis();
    let mut tx = pool.begin().await?;
    let row = sqlx::query(
        "SELECT hocr, pixel_width, pixel_height
         FROM ocr_hocr_cache
         WHERE file_sha256 = ?1 AND page_index = ?2 AND dpi = ?3
           AND language = ?4 AND engine = ?5",
    )
    .bind(&key.file_sha256)
    .bind(i64::from(key.page_index))
    .bind(i64::from(key.dpi))
    .bind(&key.language)
    .bind(&key.engine)
    .fetch_optional(&mut *tx)
    .await?;

    if row.is_some() {
        sqlx::query(
            "UPDATE ocr_hocr_cache SET last_accessed_at_ms = ?1
             WHERE file_sha256 = ?2 AND page_index = ?3 AND dpi = ?4
               AND language = ?5 AND engine = ?6",
        )
        .bind(now)
        .bind(&key.file_sha256)
        .bind(i64::from(key.page_index))
        .bind(i64::from(key.dpi))
        .bind(&key.language)
        .bind(&key.engine)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;

    row.map(|row| {
        Ok(CachedOcrPage {
            hocr: row.try_get("hocr")?,
            pixel_width: u32::try_from(row.try_get::<i64, _>("pixel_width")?)?,
            pixel_height: u32::try_from(row.try_get::<i64, _>("pixel_height")?)?,
        })
    })
    .transpose()
}

pub async fn put(pool: &SqlitePool, key: &OcrCacheKey, page: &CachedOcrPage) -> Result<()> {
    put_with_limit(pool, key, page, OCR_CACHE_MAX_ROWS).await
}

async fn put_with_limit(
    pool: &SqlitePool,
    key: &OcrCacheKey,
    page: &CachedOcrPage,
    max_rows: i64,
) -> Result<()> {
    let now = chrono::Utc::now().timestamp_millis();
    let mut tx = pool.begin().await?;
    sqlx::query(
        "INSERT INTO ocr_hocr_cache (
           file_sha256, page_index, dpi, language, engine, hocr,
           pixel_width, pixel_height, created_at_ms, last_accessed_at_ms
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)
         ON CONFLICT(file_sha256, page_index, dpi, language, engine)
         DO UPDATE SET
           hocr = excluded.hocr,
           pixel_width = excluded.pixel_width,
           pixel_height = excluded.pixel_height,
           last_accessed_at_ms = excluded.last_accessed_at_ms",
    )
    .bind(&key.file_sha256)
    .bind(i64::from(key.page_index))
    .bind(i64::from(key.dpi))
    .bind(&key.language)
    .bind(&key.engine)
    .bind(&page.hocr)
    .bind(i64::from(page.pixel_width))
    .bind(i64::from(page.pixel_height))
    .bind(now)
    .execute(&mut *tx)
    .await?;

    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ocr_hocr_cache")
        .fetch_one(&mut *tx)
        .await?;
    let excess = count.saturating_sub(max_rows.max(1));
    if excess > 0 {
        sqlx::query(
            "DELETE FROM ocr_hocr_cache
             WHERE rowid IN (
               SELECT rowid FROM ocr_hocr_cache
               ORDER BY last_accessed_at_ms ASC, rowid ASC
               LIMIT ?1
             )",
        )
        .bind(excess)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::query(include_str!(
            "../../migrations/20260726000002_ocr_hocr_cache.sql"
        ))
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    fn key(page_index: u32, dpi: u32, language: &str, engine: &str) -> OcrCacheKey {
        OcrCacheKey {
            file_sha256: "abc123".into(),
            page_index,
            dpi,
            language: language.into(),
            engine: engine.into(),
        }
    }

    fn page(text: &str) -> CachedOcrPage {
        CachedOcrPage {
            hocr: text.into(),
            pixel_width: 1200,
            pixel_height: 1600,
        }
    }

    #[tokio::test]
    async fn cache_key_changes_invalidate_lookup() {
        let pool = pool().await;
        let original = key(0, 300, "eng", "tesseract");
        put(&pool, &original, &page("<html>cached</html>"))
            .await
            .unwrap();

        assert!(get(&pool, &original).await.unwrap().is_some());
        assert!(get(&pool, &key(1, 300, "eng", "tesseract"))
            .await
            .unwrap()
            .is_none());
        assert!(get(&pool, &key(0, 600, "eng", "tesseract"))
            .await
            .unwrap()
            .is_none());
        assert!(get(&pool, &key(0, 300, "slk", "tesseract"))
            .await
            .unwrap()
            .is_none());
        assert!(get(&pool, &key(0, 300, "eng", "rapidocr"))
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn cache_evicts_least_recently_used_rows() {
        let pool = pool().await;
        put_with_limit(&pool, &key(0, 300, "eng", "tesseract"), &page("zero"), 2)
            .await
            .unwrap();
        put_with_limit(&pool, &key(1, 300, "eng", "tesseract"), &page("one"), 2)
            .await
            .unwrap();
        put_with_limit(&pool, &key(2, 300, "eng", "tesseract"), &page("two"), 2)
            .await
            .unwrap();

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ocr_hocr_cache")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 2);
        assert!(get(&pool, &key(0, 300, "eng", "tesseract"))
            .await
            .unwrap()
            .is_none());
    }
}
