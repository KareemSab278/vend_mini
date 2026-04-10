use ordering_system_lib::nfc;

fn main() {
    loop {
        match nfc::listen_for_tag_ids() {
            Ok(tag_id) => println!("{}", tag_id),
            Err(err) => {
                eprintln!("Tag listener failed: {}", err);
                std::process::exit(1);
            }
        }
    }
}
