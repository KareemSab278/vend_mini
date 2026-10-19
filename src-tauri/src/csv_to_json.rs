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
    product_availability: bool,
}

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

pub fn import_products_from_csv(
    csv_content: &str,
) -> std::result::Result<usize, ProductImportError> {
    let csv_content = csv_content.strip_prefix('\u{feff}').unwrap_or(csv_content);
    let generated_json = csv_to_json::<CsvProduct, _>(csv_content.as_bytes())
        .map_err(|error| {
            ProductImportError::InvalidCsv(format!("Failed to convert CSV to JSON: {error:#}"))
        })?;
    let products: Vec<CsvProduct> = serde_json::from_str(&generated_json)
        .map_err(|error| {
            ProductImportError::InvalidCsv(format!(
                "Failed to read generated product JSON: {error}"
            ))
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
}