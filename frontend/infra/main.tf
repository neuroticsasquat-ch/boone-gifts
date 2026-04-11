terraform {
  required_version = ">= 1.6"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  backend "azurerm" {
    resource_group_name  = "rg-tbc-app-services"
    storage_account_name = "tbcterraformstate"
    container_name       = "tfstate"
    key                  = "boone-gifts-frontend.tfstate"
  }
}

provider "azurerm" {
  features {}
}

# ---------------------------------------------------------------------------
# Resource group
# ---------------------------------------------------------------------------

resource "azurerm_resource_group" "this" {
  name     = "rg-boone-gifts"
  location = "eastus2"
}

# ---------------------------------------------------------------------------
# Static Web App
# ---------------------------------------------------------------------------

resource "azurerm_static_web_app" "this" {
  name                = "stapp-boone-gifts"
  resource_group_name = azurerm_resource_group.this.name
  location            = azurerm_resource_group.this.location
  sku_tier            = "Free"
  sku_size            = "Free"
}
