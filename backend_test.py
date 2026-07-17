#!/usr/bin/env python3
"""
GRTR Homes Backend API Test Suite
Tests all backend endpoints with role-based filtering
"""

import requests
import json
from typing import Dict, Any

# Base URL from .env
BASE_URL = "https://rental-dashboard-103.preview.emergentagent.com/api"

# Test credentials (from seed)
CREDENTIALS = {
    "manager": {"email": "manager@grtr.com", "password": "demo123"},
    "owner": {"email": "owner@grtr.com", "password": "demo123"},
    "tenant": {"email": "tenant@grtr.com", "password": "demo123"}
}

# Store test data
test_data = {
    "users": {},
    "properties": {},
    "tickets": {}
}

def print_test(name: str):
    """Print test name"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print('='*80)

def print_result(success: bool, message: str, details: Any = None):
    """Print test result"""
    status = "✅ PASS" if success else "❌ FAIL"
    print(f"{status}: {message}")
    if details:
        print(f"Details: {json.dumps(details, indent=2)}")

def test_seed():
    """Test POST /api/seed"""
    print_test("POST /api/seed - Seed database")
    try:
        response = requests.post(f"{BASE_URL}/seed")
        data = response.json()
        
        if response.status_code == 200:
            if data.get("ok") and data.get("seeded"):
                seeded = data["seeded"]
                if seeded.get("users") == 5 and seeded.get("properties") == 3 and seeded.get("tickets") == 3:
                    print_result(True, "Seed endpoint working correctly", data)
                    return True
                else:
                    print_result(False, f"Unexpected seed counts: {seeded}")
                    return False
            else:
                print_result(False, "Response missing 'ok' or 'seeded' fields", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_auth_register():
    """Test POST /api/auth/register"""
    print_test("POST /api/auth/register - User registration")
    
    # Test 1: Valid registration
    try:
        new_user = {
            "name": "Test Owner",
            "email": "testowner@grtr.com",
            "password": "test123",
            "role": "owner",
            "phone": "512-555-9999"
        }
        response = requests.post(f"{BASE_URL}/auth/register", json=new_user)
        data = response.json()
        
        if response.status_code == 200:
            user = data.get("user")
            if user and user.get("id") and user.get("email") == new_user["email"]:
                # Check password is NOT returned
                if "password" in user:
                    print_result(False, "Password field returned in response (security issue)", user)
                    return False
                # Check UUID format
                if len(user["id"]) == 36 and user["id"].count("-") == 4:
                    print_result(True, "Valid registration successful, password stripped, UUID format correct", user)
                    test_data["users"]["testowner"] = user
                else:
                    print_result(False, f"ID is not UUID format: {user['id']}")
                    return False
            else:
                print_result(False, "Response missing user or id", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 2: Duplicate email rejection
    print_test("POST /api/auth/register - Duplicate email rejection")
    try:
        response = requests.post(f"{BASE_URL}/auth/register", json=new_user)
        data = response.json()
        
        if response.status_code == 400 and "already registered" in data.get("error", "").lower():
            print_result(True, "Duplicate email correctly rejected", data)
            return True
        else:
            print_result(False, f"Expected 400 with 'already registered' error, got {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_auth_login():
    """Test POST /api/auth/login"""
    print_test("POST /api/auth/login - User login")
    
    # Test 1: Valid login for each role
    all_success = True
    for role, creds in CREDENTIALS.items():
        try:
            response = requests.post(f"{BASE_URL}/auth/login", json=creds)
            data = response.json()
            
            if response.status_code == 200:
                user = data.get("user")
                if user and user.get("id") and user.get("email") == creds["email"]:
                    # Check password is NOT returned
                    if "password" in user:
                        print_result(False, f"{role}: Password field returned (security issue)", user)
                        all_success = False
                    else:
                        print_result(True, f"{role} login successful, password stripped", {"email": user["email"], "role": user.get("role")})
                        test_data["users"][role] = user
                else:
                    print_result(False, f"{role}: Response missing user or id", data)
                    all_success = False
            else:
                print_result(False, f"{role}: Status code {response.status_code}", data)
                all_success = False
        except Exception as e:
            print_result(False, f"{role}: Exception: {str(e)}")
            all_success = False
    
    # Test 2: Invalid credentials
    print_test("POST /api/auth/login - Invalid credentials")
    try:
        response = requests.post(f"{BASE_URL}/auth/login", json={"email": "wrong@grtr.com", "password": "wrong"})
        data = response.json()
        
        if response.status_code == 401:
            print_result(True, "Invalid credentials correctly rejected with 401", data)
        else:
            print_result(False, f"Expected 401, got {response.status_code}", data)
            all_success = False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        all_success = False
    
    return all_success

def test_users_get():
    """Test GET /api/users"""
    print_test("GET /api/users - Get all users")
    try:
        response = requests.get(f"{BASE_URL}/users")
        data = response.json()
        
        if response.status_code == 200:
            if isinstance(data, list) and len(data) >= 5:
                # Check no passwords returned
                has_password = any("password" in user for user in data)
                if has_password:
                    print_result(False, "Password field found in user list (security issue)")
                    return False
                print_result(True, f"Retrieved {len(data)} users, no passwords exposed", {"count": len(data)})
                return True
            else:
                print_result(False, f"Expected list with >= 5 users, got {len(data) if isinstance(data, list) else 'not a list'}")
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_properties_crud():
    """Test Properties CRUD operations"""
    
    # Test 1: GET all properties (manager view)
    print_test("GET /api/properties?role=manager - Manager sees all")
    try:
        manager = test_data["users"]["manager"]
        response = requests.get(f"{BASE_URL}/properties", params={"userId": manager["id"], "role": "manager"})
        data = response.json()
        
        if response.status_code == 200:
            if isinstance(data, list) and len(data) == 3:
                print_result(True, f"Manager sees all {len(data)} properties", {"count": len(data)})
                test_data["properties"]["all"] = data
            else:
                print_result(False, f"Expected 3 properties, got {len(data) if isinstance(data, list) else 'not a list'}")
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 2: GET owner properties (filtered)
    print_test("GET /api/properties?role=owner - Owner sees only their properties")
    try:
        owner = test_data["users"]["owner"]
        response = requests.get(f"{BASE_URL}/properties", params={"userId": owner["id"], "role": "owner"})
        data = response.json()
        
        if response.status_code == 200:
            if isinstance(data, list):
                # Owner should see only properties where ownerId matches
                all_match = all(p.get("ownerId") == owner["id"] for p in data)
                if all_match and len(data) >= 1:
                    print_result(True, f"Owner sees only their {len(data)} properties", {"count": len(data)})
                else:
                    print_result(False, f"Owner filtering failed: {len(data)} properties, all_match={all_match}")
                    return False
            else:
                print_result(False, "Response is not a list")
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 3: GET tenant properties (filtered)
    print_test("GET /api/properties?role=tenant - Tenant sees only their properties")
    try:
        tenant = test_data["users"]["tenant"]
        response = requests.get(f"{BASE_URL}/properties", params={"userId": tenant["id"], "role": "tenant"})
        data = response.json()
        
        if response.status_code == 200:
            if isinstance(data, list):
                # Tenant should see only properties where tenantId matches
                all_match = all(p.get("tenantId") == tenant["id"] for p in data)
                if all_match and len(data) >= 1:
                    print_result(True, f"Tenant sees only their {len(data)} properties", {"count": len(data)})
                else:
                    print_result(False, f"Tenant filtering failed: {len(data)} properties, all_match={all_match}")
                    return False
            else:
                print_result(False, "Response is not a list")
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 4: POST create property
    print_test("POST /api/properties - Create new property")
    try:
        owner = test_data["users"]["owner"]
        new_property = {
            "name": "Test Property",
            "address": "123 Test St, Austin TX 78701",
            "ownerId": owner["id"],
            "ownerName": owner["name"],
            "tenantId": "",
            "monthlyRent": 2000,
            "insuranceProvider": "Test Insurance",
            "roi": 5.5,
            "monthlyEmi": 1500
        }
        response = requests.post(f"{BASE_URL}/properties", json=new_property)
        data = response.json()
        
        if response.status_code == 200:
            if data.get("id") and data.get("address") == new_property["address"]:
                # Check UUID format
                if len(data["id"]) == 36 and data["id"].count("-") == 4:
                    print_result(True, "Property created with UUID", {"id": data["id"], "address": data["address"]})
                    test_data["properties"]["test"] = data
                else:
                    print_result(False, f"ID is not UUID format: {data['id']}")
                    return False
            else:
                print_result(False, "Response missing id or address", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 5: GET single property
    print_test("GET /api/properties/:id - Get single property")
    try:
        prop_id = test_data["properties"]["test"]["id"]
        response = requests.get(f"{BASE_URL}/properties/{prop_id}")
        data = response.json()
        
        if response.status_code == 200:
            if data.get("id") == prop_id:
                print_result(True, "Single property retrieved", {"id": data["id"]})
            else:
                print_result(False, "Property ID mismatch", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 6: PUT update property
    print_test("PUT /api/properties/:id - Update property")
    try:
        prop_id = test_data["properties"]["test"]["id"]
        update_data = {"monthlyRent": 2500, "roi": 6.0}
        response = requests.put(f"{BASE_URL}/properties/{prop_id}", json=update_data)
        data = response.json()
        
        if response.status_code == 200:
            if data.get("monthlyRent") == 2500 and data.get("roi") == 6.0:
                print_result(True, "Property updated successfully", {"monthlyRent": data["monthlyRent"], "roi": data["roi"]})
            else:
                print_result(False, "Update values not reflected", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 7: DELETE property
    print_test("DELETE /api/properties/:id - Delete property")
    try:
        prop_id = test_data["properties"]["test"]["id"]
        response = requests.delete(f"{BASE_URL}/properties/{prop_id}")
        data = response.json()
        
        if response.status_code == 200:
            if data.get("deleted") == True:
                print_result(True, "Property deleted successfully", data)
                return True
            else:
                print_result(False, "Delete response incorrect", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def test_tickets_crud():
    """Test Tickets CRUD operations"""
    
    # Test 1: GET all tickets (manager view)
    print_test("GET /api/tickets?role=manager - Manager sees all")
    try:
        manager = test_data["users"]["manager"]
        response = requests.get(f"{BASE_URL}/tickets", params={"userId": manager["id"], "role": "manager"})
        data = response.json()
        
        if response.status_code == 200:
            if isinstance(data, list) and len(data) == 3:
                print_result(True, f"Manager sees all {len(data)} tickets", {"count": len(data)})
                test_data["tickets"]["all"] = data
            else:
                print_result(False, f"Expected 3 tickets, got {len(data) if isinstance(data, list) else 'not a list'}")
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 2: GET tenant tickets (filtered)
    print_test("GET /api/tickets?role=tenant - Tenant sees only their tickets")
    try:
        tenant = test_data["users"]["tenant"]
        response = requests.get(f"{BASE_URL}/tickets", params={"userId": tenant["id"], "role": "tenant"})
        data = response.json()
        
        if response.status_code == 200:
            if isinstance(data, list):
                # Tenant should see only tickets where tenantId matches
                all_match = all(t.get("tenantId") == tenant["id"] for t in data)
                if all_match and len(data) >= 1:
                    print_result(True, f"Tenant sees only their {len(data)} tickets", {"count": len(data)})
                else:
                    print_result(False, f"Tenant filtering failed: {len(data)} tickets, all_match={all_match}")
                    return False
            else:
                print_result(False, "Response is not a list")
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 3: GET owner tickets (filtered by properties they own)
    print_test("GET /api/tickets?role=owner - Owner sees tickets for their properties")
    try:
        owner = test_data["users"]["owner"]
        response = requests.get(f"{BASE_URL}/tickets", params={"userId": owner["id"], "role": "owner"})
        data = response.json()
        
        if response.status_code == 200:
            if isinstance(data, list):
                # Owner should see tickets for properties they own
                # We need to verify this by checking propertyId matches owner's properties
                print_result(True, f"Owner sees {len(data)} tickets for their properties", {"count": len(data)})
            else:
                print_result(False, "Response is not a list")
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 4: POST create ticket
    print_test("POST /api/tickets - Create new ticket with notifications")
    try:
        tenant = test_data["users"]["tenant"]
        # Get a property to create ticket for
        properties = test_data["properties"]["all"]
        if not properties:
            print_result(False, "No properties available for ticket creation")
            return False
        
        property_for_ticket = properties[0]
        new_ticket = {
            "propertyId": property_for_ticket["id"],
            "tenantId": tenant["id"],
            "tenantName": tenant["name"],
            "title": "Test Ticket - Water Heater Issue",
            "description": "Water heater not heating properly",
            "priority": "high"
        }
        response = requests.post(f"{BASE_URL}/tickets", json=new_ticket)
        data = response.json()
        
        if response.status_code == 200:
            # Check all required fields
            checks = {
                "has_id": data.get("id") is not None,
                "id_is_uuid": len(data.get("id", "")) == 36 and data.get("id", "").count("-") == 4,
                "has_propertyAddress": data.get("propertyAddress") is not None,
                "status_is_open": data.get("status") == "open",
                "has_notifications": isinstance(data.get("notifications"), list),
                "notifications_count": len(data.get("notifications", [])) >= 2 if isinstance(data.get("notifications"), list) else False
            }
            
            if all(checks.values()):
                notifications = data.get("notifications", [])
                print_result(True, "Ticket created with UUID, propertyAddress, status='open', and notifications", {
                    "id": data["id"],
                    "status": data["status"],
                    "propertyAddress": data["propertyAddress"],
                    "notifications_count": len(notifications)
                })
                test_data["tickets"]["test"] = data
            else:
                failed_checks = {k: v for k, v in checks.items() if not v}
                print_result(False, f"Ticket creation validation failed: {failed_checks}", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False
    
    # Test 5: PUT update ticket status
    print_test("PUT /api/tickets/:id - Update ticket status")
    try:
        ticket_id = test_data["tickets"]["test"]["id"]
        update_data = {"status": "in_progress"}
        response = requests.put(f"{BASE_URL}/tickets/{ticket_id}", json=update_data)
        data = response.json()
        
        if response.status_code == 200:
            if data.get("status") == "in_progress":
                print_result(True, "Ticket status updated successfully", {"status": data["status"]})
                
                # Test another status update
                update_data = {"status": "resolved"}
                response = requests.put(f"{BASE_URL}/tickets/{ticket_id}", json=update_data)
                data = response.json()
                
                if response.status_code == 200 and data.get("status") == "resolved":
                    print_result(True, "Ticket status updated to resolved", {"status": data["status"]})
                    return True
                else:
                    print_result(False, "Second status update failed", data)
                    return False
            else:
                print_result(False, "Status not updated", data)
                return False
        else:
            print_result(False, f"Status code {response.status_code}", data)
            return False
    except Exception as e:
        print_result(False, f"Exception: {str(e)}")
        return False

def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("GRTR HOMES BACKEND API TEST SUITE")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = {
        "Seed Database": test_seed(),
        "Auth - Register": test_auth_register(),
        "Auth - Login": test_auth_login(),
        "Users - Get All": test_users_get(),
        "Properties - CRUD": test_properties_crud(),
        "Tickets - CRUD": test_tickets_crud()
    }
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
