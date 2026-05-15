use pdf_editor_lib::persistence::{
    db,
    pipeline_presets::{
        create_preset, delete_preset, get_preset, list_presets, update_preset, NewPipelinePreset,
    },
};
use tempfile::TempDir;

#[tokio::test]
async fn preset_crud() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("p.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();

    let id = create_preset(
        &pool,
        &NewPipelinePreset {
            name: "Test".into(),
            description: Some("desc".into()),
            graph_json: r#"{"nodes":[],"edges":[]}"#.into(),
        },
    )
    .await
    .unwrap();

    let preset = get_preset(&pool, id).await.unwrap().unwrap();
    assert_eq!(preset.name, "Test");

    let mut updated = preset.clone();
    updated.name = "Renamed".into();
    update_preset(&pool, &updated).await.unwrap();
    assert_eq!(
        get_preset(&pool, id).await.unwrap().unwrap().name,
        "Renamed"
    );

    let all = list_presets(&pool).await.unwrap();
    assert_eq!(all.len(), 1);

    delete_preset(&pool, id).await.unwrap();
    assert!(get_preset(&pool, id).await.unwrap().is_none());
}
