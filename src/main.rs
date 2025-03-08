use actix_web::{App, HttpServer, web, HttpResponse, Responder};
use actix_web::middleware::Logger;
use clap::Parser;
use prometheus::{Encoder, TextEncoder};
use sysinfo::System;
use serde::Deserialize;
use std::sync::{Arc, Mutex};

#[derive(Parser, Debug)]
#[clap(author, version, about)]
struct Args {
    #[arg(long, default_value_t = 9001, value_name = "PORT")]
    api_port: u16,

    #[arg(long, default_value_t = 3001, value_name = "PORT")]
    orchestrator_port: u16,
}

#[derive(Clone)]
struct AppState {
    sys_info: Arc<Mutex<System>>,
}

#[derive(Deserialize)]
struct ConfigForm {
    name: String,
    value: String,
}

async fn health_check() -> impl Responder {
    HttpResponse::Ok().body("Healthy")
}

async fn metrics() -> impl Responder {
    let encoder = TextEncoder::new();
    let metric_families = prometheus::gather();
    let mut buffer = Vec::new();
    encoder.encode(&metric_families, &mut buffer).unwrap();
    HttpResponse::Ok()
        .content_type(encoder.format_type())
        .body(buffer)
}

async fn dashboard() -> &'static str {
    r#"
    <!DOCTYPE html>
    <html>
    <body>
        <h1>System Configuration</h1>
        <form action="/save" method="post">
            <label>Variable Name: <input type="text" name="name"></label><br>
            <label>Value: <input type="text" name="value"></label><br>
            <input type="submit" value="Save">
        </form>
    </body>
    </html>
    "#
}

async fn save_config(
    form: web::Form<ConfigForm>,
    data: web::Data<AppState>,
) -> impl Responder {
    let mut sys_info = data.sys_info.lock().unwrap();
    sys_info.refresh_all();
    HttpResponse::Ok().body(format!("Saved {}: {}", form.name, form.value))
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    env_logger::init_from_env(
        env_logger::Env::default().default_filter_or("info")
    );

    let args = Args::parse();

    let sys = System::new_all();
    let sys_info = Arc::new(Mutex::new(sys));

    let state = web::Data::new(AppState {
        sys_info: sys_info.clone(),
    });

    // API Server (9001)
    let api_server = HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .wrap(Logger::default())
            .service(
                web::scope("/api")
                    .route("/health", web::get().to(health_check))
                    .route("/metrics", web::get().to(metrics)),
            )
            .service(
                web::scope("/dashboard")
                    .route("", web::get().to(dashboard))
                    .route("/save", web::post().to(save_config)),
            )
    })
    .bind(("0.0.0.0", args.api_port))?
    .run();

    // Orchestrator Server (3001)
    let orchestrator_server = HttpServer::new(|| {
        App::new()
            .wrap(Logger::default())
            .route("/status", web::get().to(health_check))
    })
    .bind(("0.0.0.0", args.orchestrator_port))?
    .run();

    // Run both servers concurrently
    tokio::try_join!(
        api_server,
        orchestrator_server
    )?;

    Ok(())
}
