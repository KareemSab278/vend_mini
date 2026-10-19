/*
    this gets the csv file then converts it to json
*/

use anyhow::{Context, Result};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::io::Read;

use crate::database;

#[derive(Debug)]
pub enum ProductImportError {
    InvalidCsv(String),
    Database {
        row: usize,
        imported: usize,
        message: String,
    },
}

impl std::fmt::Display for ProductImportError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidCsv(message) => formatter.write_str(message),
            Self::Database {
                row,
                imported,
                message,
            } => write!(
                formatter,
                "Failed to add product from CSV row {row} after inserting {imported} product(s): {message}"
            ),
        }
    }
}

#[derive(Deserialize, Serialize)]
struct CsvProduct {
    #[serde(rename = "product_id", default, skip_serializing)]
    _product_id: Option<String>,
    product_name: String,
    product_category: String,
    product_price: f64,
    #[serde(deserialize_with = "deserialize_csv_bool")]
    product_availability: bool,
}

fn deserialize_csv_bool<'de, D>(deserializer: D) -> std::result::Result<bool, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = String::deserialize(deserializer)?;
    if value.trim().eq_ignore_ascii_case("true") {
        Ok(true)
    } else if value.trim().eq_ignore_ascii_case("false") {
        Ok(false)
    } else {
        Err(serde::de::Error::custom(format!(
            "expected `true` or `false`, found `{value}`"
        )))
    }
}

fn csv_to_records<T, R>(reader: R) -> Result<Vec<T>>
where
    T: DeserializeOwned,
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

    Ok(items)
}

pub fn csv_to_json<T, R>(reader: R) -> Result<String>
where
    T: DeserializeOwned + Serialize,
    R: Read,
{
    let items = csv_to_records::<T, _>(reader)?;
    serde_json::to_string_pretty(&items)
        .context("Failed to serialize the validated records to JSON")
}

pub fn import_products_from_csv(
    csv_content: &str,
) -> std::result::Result<usize, ProductImportError> {
    let csv_content = csv_content.strip_prefix('\u{feff}').unwrap_or(csv_content);
    let products = csv_to_records::<CsvProduct, _>(csv_content.as_bytes()).map_err(|error| {
        ProductImportError::InvalidCsv(format!("Failed to convert CSV to JSON: {error:#}"))
    })?;

    if products.is_empty() {
        return Err(ProductImportError::InvalidCsv(
            "The CSV file does not contain any products.".to_string(),
        ));
    }

    let product_count = products.len();
    for (index, product) in products.into_iter().enumerate() {
        database::add_product(
            &product.product_name,
            &product.product_category,
            product.product_price,
            product.product_availability,
        )
        .map_err(|error| ProductImportError::Database {
            row: index + 2,
            imported: index,
            message: error.to_string(),
        })?;
    }

    Ok(product_count)
}

#[cfg(test)]
mod tests {
    use super::csv_to_json;

    #[derive(serde::Deserialize, serde::Serialize)]
    struct ProductRow {
        #[serde(rename = "product_id", default, skip_serializing)]
        _product_id: Option<String>,
        product_name: String,
    }

    #[test]
    fn conversion_drops_product_ids_from_generated_json() {
        let csv = "product_id,product_name\nalready-used,Cola\n";
        let json = csv_to_json::<ProductRow, _>(csv.as_bytes()).unwrap();

        assert!(!json.contains("product_id"));
        assert!(json.contains("Cola"));
    }

    #[test]
    fn conversion_accepts_csv_without_product_ids() {
        let csv = "product_name\nCola\n";
        let json = csv_to_json::<ProductRow, _>(csv.as_bytes()).unwrap();

        assert!(json.contains("Cola"));
    }

    #[test]
    fn product_records_accept_uppercase_and_lowercase_availability() {
        let csv = concat!(
            "product_name,product_category,product_price,product_availability\n",
            "Cola,Drinks,1.50,TRUE\n",
            "Water,Drinks,1.00,false\n",
        );
        let products = super::csv_to_records::<super::CsvProduct, _>(csv.as_bytes()).unwrap();

        assert!(products[0].product_availability);
        assert!(!products[1].product_availability);
    }
}
