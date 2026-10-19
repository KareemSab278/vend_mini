/*
    this gets the csv file then converts it to json
*/

use anyhow::{Context, Result};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::io::Read;

use database::Product;

pub fn csv_to_json<T, R>(reader: R) -> Result<String>
where
    T: DeserializeOwned + Serialize,
    R: Read,
{
    let mut csv_reader = csv::Reader::from_reader(reader);
    let mut items: Vec<T> = Vec::new();

    for (index, row) in csv_reader.deserialize::<T>().enumerate() {
        let row_number = index + 2; // Header is row 1.

        let item: T = row.with_context(|| {
            format!(
                "Failed to map CSV row {} to the requested struct. \
                 Check column names, required fields, and data types.",
                row_number
            )
        })?;

        items.push(item);
    }

    serde_json::to_string_pretty(&items)
        .context("Failed to serialize the validated records to JSON")
}

/*
    mod csv_to_json;
    use csv_to_json::*;
    use anyhow::{Context, Result};
    use std::fs::File;

    fn main() -> Result<()> {
        let file = File::open("products.csv")
            .context("Could not open products.csv")?;

        let json = csv_to_json::<Product, _>(file)
            .context("CSV-to-JSON conversion failed")?;

        println!("{}", json);

        Ok(())
    }
 */