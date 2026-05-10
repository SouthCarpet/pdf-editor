use pdf_editor_lib::persistence::{db, projects::*};
use tempfile::TempDir;

#[tokio::test]
async fn project_with_files_and_pipelines() {
    let tmp = TempDir::new().unwrap();
    let pool = db::create_pool(&tmp.path().join("pr.db")).await.unwrap();
    db::run_migrations(&pool).await.unwrap();

    let pid = create_project(&pool, &NewProject {
        name: "Faktúry Q1".into(),
        description: None,
    }).await.unwrap();

    add_project_file(&pool, pid, "C:/inv1.pdf").await.unwrap();
    add_project_file(&pool, pid, "C:/inv2.pdf").await.unwrap();

    let files = list_project_files(&pool, pid).await.unwrap();
    assert_eq!(files.len(), 2);

    remove_project_file(&pool, pid, "C:/inv1.pdf").await.unwrap();
    assert_eq!(list_project_files(&pool, pid).await.unwrap().len(), 1);

    let p = get_project(&pool, pid).await.unwrap().unwrap();
    assert_eq!(p.name, "Faktúry Q1");

    delete_project(&pool, pid).await.unwrap();
    assert!(get_project(&pool, pid).await.unwrap().is_none());
    assert!(list_project_files(&pool, pid).await.unwrap().is_empty());
}
