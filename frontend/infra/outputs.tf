output "default_hostname" {
  description = "Default URL of the Static Web App"
  value       = "https://${azurerm_static_web_app.this.default_host_name}"
}

output "resource_group_name" {
  description = "Name of the resource group"
  value       = azurerm_resource_group.this.name
}

output "static_web_app_name" {
  description = "Name of the Static Web App"
  value       = azurerm_static_web_app.this.name
}

output "deployment_token" {
  description = "Deployment token for the Static Web App (use as AZURE_STATIC_WEB_APPS_API_TOKEN secret)"
  value       = azurerm_static_web_app.this.api_key
  sensitive   = true
}
