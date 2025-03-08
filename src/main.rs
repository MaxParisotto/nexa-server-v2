use actix_web::{App, HttpServer, web, HttpResponse, Responder};
use clap::Parser;
use prometheus::{Encoder, TextEncoder};
use sysinfo::System;
use serde::Deserialize;
use std::sync::{Arc, Mutex};
use log::info;
use log4rs::init_file;
use serde_json::json;

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
    info!("Health check requested");
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

async fn dashboard() -> HttpResponse {
    info!("Dashboard accessed");
    let html = r#"
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            .log-entry { border-bottom: 1px solid #ddd; padding: 10px; margin: 10px 0; }
            .log-entry.error { background: #ffdddd; }
            .log-entry.info { background: #ddffdd; }
        </style>
    </head>
    <body>
        <h1>System Configuration & Logs</h1>
        <div id="logs"></div>
        <form action="/save" method="post" style="margin-top: 20px;">
            <label>Variable Name: <input type="text" name="name"></label><br>
            <label>Value: <input type="text" name="value"></label><br>
            <input type="submit" value="Save">
        </form>
        <script>
            function fetchLogs() {
                fetch('/api/logs')
                    .then(response => response.json())
                    .then(data => {
                        const logContainer = document.getElementById('logs');
                        logContainer.innerHTML = '';
                        data.forEach(entry => {
                            const entryDiv = document.createElement('div');
                            entryDiv.className = `log-entry ${entry.level.toLowerCase()}`;
                            entryDiv.textContent = `[${entry.timestamp}] ${entry.message}`;
                            logContainer.appendChild(entryDiv);
                        });
                    });
            }
            setInterval(fetchLogs, 2000);
            fetchLogs();
        </script>
    </body>
    </html>
    "#;
    HttpResponse::Ok().body(html)
}

async fn save_config(
    form: web::Form<ConfigForm>,
    data: web::Data<AppState>,
) -> impl Responder {
    let mut sys_info = data.sys_info.lock().unwrap();
    sys_info.refresh_all();
    info!("Saved config {}: {}", form.name, form.value);
    HttpResponse::Ok().body(format!("Saved {}: {}", form.name, form.value))
}

async fn get_logs() -> impl Responder {
    // Dummy logs for demonstration
    let logs = vec![
        json!({
            "timestamp": "2025-03-08T16:35:00Z",
            "level": "INFO",
            "message": "System initialized"
        }),
        json!({
            "timestamp": "2025-03-08T16:36:00Z",
            "level": "WARN",
            "message": "High memory usage detected"
        })
    ];
    HttpResponse::Ok().json(logs)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    log4rs::init_file("log4rs.yaml", Default::default()).unwrap();

    let args = Args::parse();

    let sys = System::new_all();
    let sys_info = Arc::new(Mutex::new(sys));

    let state = web::Data::new(AppState {
        sys_info: sys_info.clone(),
    });

    let api_server = HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .service(
                web::scope("/api")
                    .route("/health", web::get().to(health_check))
                    .route("/metrics", web::get().to(metrics))
                    .route("/logs", web::get().to(get_logs)),
            )
            .service(
                web::scope("/dashboard")
                    .route("", web::get().to(dashboard))
                    .route("/save", web::post().to(save_config)),
            )
    })
    .bind(("0.0.0.0", args.api_port))?
    .run();

    let orchestrator_server = HttpServer::new(|| {
        App::new()
            .route("/status", web::get().to(health_check))
    })
    .bind(("0.0.0.0", args.orchestrator_port))?
    .run();

    tokio::try_join!(api_server, orchestrator_server)?;

    Ok(())
}
