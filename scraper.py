import asyncio
import json
import re
import datetime
import os
import random
from playwright.async_api import async_playwright

DATA_FILE = 'data.json'
JS_DATA_FILE = 'data.js'
CATEGORIES_FILE = 'categories.js'

def load_data():
    if os.path.exists(DATA_FILE):
        with open(DATA_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {}

def save_data(data):
    # Save as JSON for backend use
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2)
    
    # Save as JS for frontend use (using window.productData for global access)
    js_content = f"window.productData = {json.dumps(data, indent=2)};"
    with open(JS_DATA_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)

def load_categories():
    """Load categories from the nested categories.js structure"""
    if os.path.exists(CATEGORIES_FILE):
        with open(CATEGORIES_FILE, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Extract JSON from JavaScript: window.CATEGORY_DATA = {...};
        try:
            # Find the start of the JSON object
            start = content.find('{')
            # Find the closing }; at the end
            end = content.rfind('};')
            if start == -1 or end == -1:
                print("Error: Could not parse categories.js format")
                return {"groups": [], "custom": []}
            
            json_str = content[start:end+1]
            return json.loads(json_str)
            
        except json.JSONDecodeError as e:
            print(f"Error parsing categories.js: {e}")
            return {"groups": [], "custom": []}
    
    print("categories.js not found")
    return {"groups": [], "custom": []}

def flatten_categories(category_data):
    """Flatten all categories from all groups for the scraper"""
    all_categories = []
    for group in category_data.get('groups', []):
        for cat in group.get('categories', []):
            all_categories.append(cat)
    
    # Add custom categories if any
    for custom in category_data.get('custom', []):
        all_categories.append(custom)
    
    return all_categories

def normalize_unit(name, price_str):
    """
    Extracts quantity from name and normalizes price to per 1kg or 1L.
    Returns: (quantity_str, normalized_price, unit_type)
    """
    name_lower = name.lower()
    price = float(re.sub(r'[^\d.]', '', price_str))
    
    # Regex patterns for different units
    kg_pattern = r'(\d+(?:\.\d+)?)\s*(kg|gm|g)\b'
    l_pattern = r'(\d+(?:\.\d+)?)\s*(l|ml|ltr)\b'
    
    kg_match = re.search(kg_pattern, name_lower)
    l_match = re.search(l_pattern, name_lower)
    
    quantity_display = "Per Piece"
    norm_price = price
    unit_type = "piece"

    if kg_match:
        val = float(kg_match.group(1))
        unit = kg_match.group(2)
        if unit in ['gm', 'g']:
            val /= 1000.0
        
        if val > 0:
            norm_price = price / val
            quantity_display = f"{val} kg" if val >= 1 else f"{int(val*1000)} gm"
            unit_type = "kg"
            
    elif l_match:
        val = float(l_match.group(1))
        unit = l_match.group(2)
        if unit in ['ml']:
            val /= 1000.0
            
        if val > 0:
            norm_price = price / val
            quantity_display = f"{val} L" if val >= 1 else f"{int(val*1000)} ml"
            unit_type = "liter"
            
    return quantity_display, round(norm_price, 2), unit_type

async def scrape_category(sem, context, category, current_data):
    async with sem:
        page = await context.new_page()
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] Scraping {category['name']}...")
        try:
            # Add a small random delay
            await asyncio.sleep(random.uniform(2, 5))
            
            # Use a slightly longer timeout and wait for networkidle
            response = await page.goto(category['url'], wait_until="load", timeout=120000)
            
            if response.status == 403:
                print(f"  [!] 403 Forbidden for {category['name']}. Might be blocked by Cloudflare.")
                return False
            
            # Wait for content to appear
            try:
                await page.wait_for_selector('.product-box', timeout=20000)
            except:
                # If not found, maybe no products in this category?
                pass
            
            # Auto-scroll to load all items
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(3000)
            
            # Select all product items
            items = await page.query_selector_all('.product-box')
            print(f"  [+] Found {len(items)} items in {category['name']}")
            
            if len(items) == 0:
                # Check if it was really empty or just failed to load
                content = await page.content()
                if "403 Forbidden" in content or "Cloudflare" in content:
                    print(f"  [!] Cloudflare challenge detected for {category['name']}")
                    return False

            today_str = datetime.date.today().isoformat()
            
            for item in items:
                try:
                    # Extract Name
                    title_el = await item.query_selector('.product-box-title a')
                    if not title_el: continue
                    name = await title_el.inner_text()
                    url_suffix = await title_el.get_attribute('href')
                    product_url = f"https://www.shwapno.com{url_suffix}"
                    
                    # Extract Image
                    img_el = await item.query_selector('img')
                    img_src = await img_el.get_attribute('src') if img_el else ""
                    
                    # Extract Price
                    price_el = await item.query_selector('.product-price .active-price')
                    if not price_el: continue
                    price_text = await price_el.inner_text()
                    current_price = float(re.sub(r'[^\d.]', '', price_text))
                    
                    # Normalize
                    qty_disp, norm_price, unit_type = normalize_unit(name, price_text)
                    
                    # Generate ID
                    prod_id = re.sub(r'\W+', '', name).lower()
                    
                    if prod_id not in current_data:
                        current_data[prod_id] = {
                            "id": prod_id,
                            "name": name,
                            "url": product_url,
                            "image": img_src,
                            "category": category['name'],
                            "history": []
                        }
                    
                    current_data[prod_id].update({
                        "current_price": current_price,
                        "normalized_price": norm_price,
                        "unit": qty_disp,
                        "unit_type": unit_type,
                        "image": img_src
                    })
                    
                    history = current_data[prod_id]["history"]
                    if not history or history[-1]['date'] != today_str:
                         history.append({
                            "date": today_str,
                            "price": current_price,
                            "normalized_price": norm_price
                        })
                    elif history[-1]['date'] == today_str:
                        history[-1]['price'] = current_price
                        history[-1]['normalized_price'] = norm_price

                except Exception as e:
                    pass
            
            return True
                    
        except Exception as e:
            print(f"  [X] Failed to scrape {category['name']}: {e}")
            return False
        finally:
            await page.close()

async def main():
    data = load_data()
    category_data = load_categories()
    all_categories = flatten_categories(category_data)
    enabled_categories = [c for c in all_categories if c.get('enabled', True)]
    
    print(f"Loaded {len(all_categories)} categories from {len(category_data.get('groups', []))} groups")
    print(f"Starting scrape for {len(enabled_categories)} enabled categories...")

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-setuid-sandbox"]
        )
        # Use a more realistic context
        context = await browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
            viewport={'width': 1920, 'height': 1080}
        )
        
        sem = asyncio.Semaphore(2) # Even lower concurrency for stability
        
        results = []
        # Chunk categories to save progress
        chunk_size = 10
        for i in range(0, len(enabled_categories), chunk_size):
            chunk = enabled_categories[i:i + chunk_size]
            tasks = [scrape_category(sem, context, cat, data) for cat in chunk]
            chunk_results = await asyncio.gather(*tasks, return_exceptions=True)
            results.extend(chunk_results)
            
            # Save progress after each chunk
            save_data(data)
            print(f"Progress: {min(i + chunk_size, len(enabled_categories))}/{len(enabled_categories)} categories processed. Data saved.")
        
        await browser.close()
    
    # Final save (redundant but safe)
    save_data(data)
    
    # Also sync the accurate categories to JSON for consistency
    with open('categories.json', 'w', encoding='utf-8') as f:
        json.dump(category_data, f, indent=2)

    success_count = sum(1 for r in results if r is True)
    fail_count = len(results) - success_count
    print(f"\nScraping complete!")
    print(f"Successfully scraped: {success_count}")
    print(f"Failed: {fail_count}")

if __name__ == "__main__":
    asyncio.run(main())
